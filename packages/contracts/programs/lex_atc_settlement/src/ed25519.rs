use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;

use crate::errors::CustomError;

pub fn parse_ed25519_ix(ix: &Instruction) -> Result<(Pubkey, Vec<u8>)> {
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

