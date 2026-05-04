use anchor_lang::prelude::*;

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

