const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey } = require('@solana/web3.js');
const WalletEngine = require('../../WalletEngine');

const assertEnabled = (provider) => {
    if (!provider.enabled) {
        const err = new Error('SOLANA_SETTLEMENT_DISABLED');
        err.code = 'SOLANA_SETTLEMENT_DISABLED';
        throw err;
    }
    if (!provider.rpcUrl) {
        const err = new Error('SOLANA_RPC_URL_MISSING');
        err.code = 'SOLANA_RPC_URL_MISSING';
        throw err;
    }
};

const requireTreasuryKeypair = () => {
    const treasuryKp = WalletEngine.getTreasuryKeypair();
    if (!treasuryKp) {
        const err = new Error('SETTLEMENT_KEYS_MISSING');
        err.code = 'SETTLEMENT_KEYS_MISSING';
        throw err;
    }
    return treasuryKp;
};

const buildProgram = (provider, authorityKeypair) => {
    assertEnabled(provider);
    if (!authorityKeypair) {
        const err = new Error('SOLANA_AUTHORITY_KEYPAIR_MISSING');
        err.code = 'SOLANA_AUTHORITY_KEYPAIR_MISSING';
        throw err;
    }
    const connection = new Connection(provider.rpcUrl, provider.commitment);
    const wallet = new anchor.Wallet(authorityKeypair);
    const anchorProvider = new anchor.AnchorProvider(connection, wallet, { commitment: provider.commitment });
    return new anchor.Program(provider.idl, provider.programId, anchorProvider);
};

const deriveChannelPda = (provider, authorityPubkey, treasuryPubkey) => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('channel'), authorityPubkey.toBuffer(), treasuryPubkey.toBuffer()],
        provider.programId
    )[0];
};

module.exports = {
    assertEnabled,
    requireTreasuryKeypair,
    buildProgram,
    deriveChannelPda,
};

