use anchor_lang::prelude::*;

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

