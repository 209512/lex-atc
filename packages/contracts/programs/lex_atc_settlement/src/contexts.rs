use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as IX_ID;
use anchor_spl::token::{Token, TokenAccount};

use crate::errors::CustomError;
use crate::state::StateChannel;

#[derive(Accounts)]
pub struct VerifyZkProof<'info> {
    pub authority: Signer<'info>,
    #[account(address = IX_ID)]
    /// CHECK: This is the Instructions sysvar; Anchor cannot type-check it beyond the fixed sysvar address constraint.
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
    /// CHECK: Used only as a public key in PDA derivation; the program does not read/modify treasury account data.
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
    /// CHECK: Used only as a public key in PDA derivation; the program does not read/modify treasury account data.
    pub treasury: UncheckedAccount<'info>,
    #[account(address = IX_ID)]
    /// CHECK: This is the Instructions sysvar; Anchor cannot type-check it beyond the fixed sysvar address constraint.
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
    /// CHECK: Used only as a public key in PDA derivation; the program does not read/modify treasury account data.
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
    /// CHECK: This is used only as a public key in PDA derivation (authority.key()) and is not required to sign for this instruction.
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
