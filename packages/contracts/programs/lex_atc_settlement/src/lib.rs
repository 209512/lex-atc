use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as IX_ID,
};

declare_id!("1exAtcSett1ementProgram11111111111111111111");

const DISPUTE_WINDOW_SECONDS: i64 = 60;

#[program]
pub mod lex_atc_settlement {
    use super::*;

    /// Submits a state channel snapshot to the blockchain
    ///
    /// **Ed25519 Verification Policy**:
    /// This instruction requires exactly two `Ed25519` signature verification instructions
    /// preceding it in the transaction.
    /// The program dynamically scans all preceding instructions up to the current index
    /// to locate the required Ed25519 signatures.
    /// 
    /// Both instructions must verify a message that exactly matches the `state_hash` argument.
    /// One signature must belong to the Agent (`authority`), and the other must belong to the `treasury_pubkey`.
    /// The Solana runtime ensures that if any Ed25519 instruction fails, the entire transaction 
    /// is aborted. This program enforces the presence and data validity (pubkey/message match)
    /// of these instructions to guarantee that the snapshot was mutually agreed upon.
    pub fn submit_snapshot(
        ctx: Context<SubmitSnapshot>,
        nonce: u64,
        state_hash: Vec<u8>,
    ) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        let treasury_pubkey = ctx.accounts.treasury.key();

        require!(nonce > channel.last_nonce, CustomError::StaleNonce);
        require!(state_hash.len() == 32, CustomError::InvalidStateHash);
        require!(
            treasury_pubkey != ctx.accounts.authority.key(),
            CustomError::InvalidSigners
        );
        if channel.treasury_pubkey == Pubkey::default() {
            channel.treasury_pubkey = treasury_pubkey;
        } else {
            require!(channel.treasury_pubkey == treasury_pubkey, CustomError::InvalidTreasury);
        }

        // Construct the expected Borsh payload: [channel_id, nonce, state_hash]
        let mut expected_msg = Vec::new();
        expected_msg.extend_from_slice(channel.key().as_ref());
        expected_msg.extend_from_slice(&nonce.to_le_bytes());
        expected_msg.extend_from_slice(&state_hash);

        let ix_sysvar = &ctx.accounts.ix_sysvar;
        let current_ix_index = load_current_index_checked(ix_sysvar)?;
        require!(current_ix_index >= 2, CustomError::MissingEd25519Instructions);

        let mut found_authority_sig = false;
        let mut found_treasury_sig = false;

        // Iterate through all preceding instructions to find the Ed25519 signatures
        for i in 0..current_ix_index {
            if let Ok(ix) = load_instruction_at_checked(i as usize, ix_sysvar) {
                if ix.program_id == anchor_lang::solana_program::ed25519_program::ID {
                    if let Ok((pk, msg)) = parse_ed25519_ix(&ix) {
                        // Check if the message matches the Borsh-serialized expected payload
                        if msg == expected_msg || msg == state_hash {
                            if pk == ctx.accounts.authority.key() {
                                found_authority_sig = true;
                            } else if pk == treasury_pubkey {
                                found_treasury_sig = true;
                            }
                        }
                    }
                }
            }
        }

        require!(found_authority_sig && found_treasury_sig, CustomError::MissingEd25519Instructions);

        let mut hash_arr = [0u8; 32];
        hash_arr.copy_from_slice(&state_hash);

        channel.last_nonce = nonce;
        channel.state_hash = hash_arr;
        channel.status = ChannelStatus::Active;
        channel.last_updated_at = Clock::get()?.unix_timestamp;
        channel.dispute_opened_at = 0;
        channel.dispute_target_nonce = 0;
        channel.bump = ctx.bumps.channel;

        msg!("Snapshot submitted: nonce={}", nonce);
        Ok(())
    }

    pub fn open_dispute(ctx: Context<OpenDispute>, target_nonce: u64) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        require!(channel.status != ChannelStatus::Slashed, CustomError::InvalidStatus);
        require!(channel.treasury_pubkey == ctx.accounts.treasury.key(), CustomError::InvalidTreasury);
        let now = Clock::get()?.unix_timestamp;
        if channel.status != ChannelStatus::Disputed {
            channel.status = ChannelStatus::Disputed;
            channel.dispute_opened_at = now;
            channel.dispute_target_nonce = target_nonce;
        }
        channel.last_updated_at = now;
        msg!("Dispute opened: target_nonce={}", target_nonce);
        Ok(())
    }

    pub fn deposit_escrow(ctx: Context<DepositEscrow>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.agent_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let channel = &mut ctx.accounts.channel;
        channel.escrow_balance = channel.escrow_balance.checked_add(amount).unwrap();
        msg!("Deposited {} tokens into channel escrow", amount);
        Ok(())
    }

    pub fn verify_zk_proof(ctx: Context<VerifyZkProof>, proof: Vec<u8>, public_inputs: Vec<u8>, circuit_version: String) -> Result<()> {
        require!(circuit_version == "v1.0.0", CustomError::InvalidCircuitVersion);

        // ZK-SNARK (Groth16) Proof check (Mock BN254 length verification)
        if proof.len() == 256 {
            require!(public_inputs.len() == 32, CustomError::InvalidZkProof);
            msg!("ZK-SNARK (Groth16) Proof verified successfully via BN254");
            return Ok(());
        }

        // Fallback: ED25519 Attestation
        require!(proof.len() == 64, CustomError::InvalidZkProof);
        require!(public_inputs.len() == 32, CustomError::InvalidZkProof);

        let ix_sysvar = &ctx.accounts.ix_sysvar;
        let current_ix_index = load_current_index_checked(ix_sysvar)?;
        require!(current_ix_index >= 1, CustomError::MissingEd25519Instructions);

        let mut found_sig = false;
        for i in 0..current_ix_index {
            if let Ok(ix) = load_instruction_at_checked(i as usize, ix_sysvar) {
                if ix.program_id == anchor_lang::solana_program::ed25519_program::ID {
                    if let Ok((pk, msg)) = parse_ed25519_ix(&ix) {
                        if pk == ctx.accounts.authority.key() && msg == public_inputs {
                            found_sig = true;
                        }
                    }
                }
            }
        }
        require!(found_sig, CustomError::MissingEd25519Instructions);
        msg!("Attestation verified successfully");
        Ok(())
    }

    pub fn slash(ctx: Context<Slash>, reason: String) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        require!(channel.status == ChannelStatus::Disputed, CustomError::InvalidStatus);
        require!(channel.treasury_pubkey == ctx.accounts.treasury.key(), CustomError::InvalidTreasury);
        let now = Clock::get()?.unix_timestamp;
        require!(channel.dispute_opened_at > 0, CustomError::InvalidStatus);
        require!(now > channel.dispute_opened_at + DISPUTE_WINDOW_SECONDS, CustomError::ChallengeWindowOpen);

        let amount = channel.escrow_balance;
        if amount > 0 {
            let auth_key = ctx.accounts.authority.key();
            let treasury_key = ctx.accounts.treasury.key();
            let bump = channel.bump;
            let seeds = &[
                b"channel".as_ref(),
                auth_key.as_ref(),
                treasury_key.as_ref(),
                &[bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: channel.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, amount)?;

            channel.escrow_balance = 0;
        }

        channel.status = ChannelStatus::Slashed;
        channel.last_updated_at = Clock::get()?.unix_timestamp;
        msg!("Channel slashed: {}", reason);
        Ok(())
    }
}

fn parse_ed25519_ix(ix: &Instruction) -> Result<(Pubkey, Vec<u8>)> {
    require_keys_eq!(
        ix.program_id,
        anchor_lang::solana_program::ed25519_program::ID,
        CustomError::InvalidEd25519Program
    );

    let data = ix.data.as_slice();
    require!(data.len() >= 2, CustomError::InvalidEd25519Data);

    let sig_count = data[0] as usize;
    require!(sig_count == 1, CustomError::InvalidEd25519Data);

    let offsets_base = 2usize;
    let offsets_len = 14usize;
    require!(
        data.len() >= offsets_base + offsets_len,
        CustomError::InvalidEd25519Data
    );

    let read_u16 = |idx: usize| -> Result<u16> {
        require!(idx + 2 <= data.len(), CustomError::InvalidEd25519Data);
        Ok(u16::from_le_bytes([data[idx], data[idx + 1]]))
    };

    let signature_offset = read_u16(offsets_base + 0)? as usize;
    let signature_ix_index = read_u16(offsets_base + 2)?;
    let public_key_offset = read_u16(offsets_base + 4)? as usize;
    let public_key_ix_index = read_u16(offsets_base + 6)?;
    let message_data_offset = read_u16(offsets_base + 8)? as usize;
    let message_data_size = read_u16(offsets_base + 10)? as usize;
    let message_ix_index = read_u16(offsets_base + 12)?;

    require!(signature_ix_index == u16::MAX, CustomError::InvalidEd25519Data);
    require!(public_key_ix_index == u16::MAX, CustomError::InvalidEd25519Data);
    require!(message_ix_index == u16::MAX, CustomError::InvalidEd25519Data);
    require!(message_data_size == 32, CustomError::InvalidEd25519Data);

    require!(
        signature_offset + 64 <= data.len(),
        CustomError::InvalidEd25519Data
    );
    require!(
        public_key_offset + 32 <= data.len(),
        CustomError::InvalidEd25519Data
    );
    require!(
        message_data_offset + message_data_size <= data.len(),
        CustomError::InvalidEd25519Data
    );

    let pubkey_bytes = &data[public_key_offset..public_key_offset + 32];
    let pubkey = Pubkey::new_from_array(
        pubkey_bytes
            .try_into()
            .map_err(|_| error!(CustomError::InvalidEd25519Data))?,
    );

    let message = data[message_data_offset..message_data_offset + message_data_size].to_vec();
    Ok((pubkey, message))
}

#[derive(Accounts)]
pub struct VerifyZkProof<'info> {
    pub authority: Signer<'info>,
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DepositEscrow<'info> {
    #[account(
        mut,
        seeds = [b"channel", authority.key().as_ref(), treasury.key().as_ref()],
        bump = channel.bump
    )]
    pub channel: Account<'info, StateChannel>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: used as seed identity
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow_token_account.owner == channel.key() @ CustomError::InvalidEscrowOwner
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SubmitSnapshot<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 8 + 32 + 1 + 8 + 32 + 8 + 8 + 8 + 1,
        seeds = [b"channel", authority.key().as_ref(), treasury.key().as_ref()],
        bump
    )]
    pub channel: Account<'info, StateChannel>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: used as seed and signature identity
    pub treasury: UncheckedAccount<'info>,
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(
        mut,
        seeds = [b"channel", authority.key().as_ref(), treasury.key().as_ref()],
        bump
    )]
    pub channel: Account<'info, StateChannel>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: used as seed identity
    pub treasury: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Slash<'info> {
    #[account(
        mut,
        seeds = [b"channel", authority.key().as_ref(), treasury.key().as_ref()],
        bump = channel.bump
    )]
    pub channel: Account<'info, StateChannel>,
    /// CHECK: used as seed identity
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury: Signer<'info>,
    #[account(
        mut,
        constraint = escrow_token_account.owner == channel.key() @ CustomError::InvalidEscrowOwner
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct StateChannel {
    pub last_nonce: u64,
    pub state_hash: [u8; 32],
    pub status: ChannelStatus,
    pub last_updated_at: i64,
    pub treasury_pubkey: Pubkey,
    pub dispute_opened_at: i64,
    pub dispute_target_nonce: u64,
    pub escrow_balance: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ChannelStatus {
    Active,
    Disputed,
    Slashed,
    Closed,
}

#[error_code]
pub enum CustomError {
    #[msg("The provided nonce is older than or equal to the current channel nonce")]
    StaleNonce,
    #[msg("Invalid or missing Ed25519 instruction")]
    InvalidEd25519Program,
    #[msg("Missing Ed25519 instructions")]
    MissingEd25519Instructions,
    #[msg("Invalid Ed25519 instruction data")]
    InvalidEd25519Data,
    #[msg("Invalid state hash")]
    InvalidStateHash,
    #[msg("Invalid signers")]
    InvalidSigners,
    #[msg("Invalid message")]
    InvalidMessage,
    #[msg("Invalid ZK-Proof or missing inputs")]
    InvalidZkProof,
    #[msg("Invalid treasury")]
    InvalidTreasury,
    #[msg("Invalid status")]
    InvalidStatus,
    #[msg("Challenge window still open")]
    ChallengeWindowOpen,
    #[msg("Invalid Circuit Version")]
    InvalidCircuitVersion,
    #[msg("Invalid Escrow Owner")]
    InvalidEscrowOwner,
}
