const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram, Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const nacl = require('tweetnacl');
const { requireTreasuryKeypair, deriveChannelPda, buildProgram } = require('./program');

const submitSnapshot = async (provider, snapshot, { authorityKeypair, commitment } = {}) => {
    const program = buildProgram(provider, authorityKeypair);
    const treasuryKp = requireTreasuryKeypair();
    const chan = deriveChannelPda(provider, program.provider.wallet.publicKey, treasuryKp.publicKey);
    const txCommitment = String(commitment || provider.commitment);
    const stateHashBytes = Buffer.from(String(snapshot.stateHash || ''), 'hex');
    
    if (stateHashBytes.length !== 32) {
        const err = new Error('SOLANA_SNAPSHOT_SIGNATURES_INVALID');
        err.code = 'SOLANA_SNAPSHOT_SIGNATURES_INVALID';
        throw err;
    }

    const msgBuffer = Buffer.concat([
        chan.toBuffer(),
        (() => { const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(snapshot.nonce)); return buf; })(),
        stateHashBytes
    ]);

    const agentSig = nacl.sign.detached(msgBuffer, authorityKeypair.secretKey);
    const treasurySig = nacl.sign.detached(msgBuffer, treasuryKp.secretKey);

    const ixAgent = Ed25519Program.createInstructionWithPublicKey({
        publicKey: program.provider.wallet.publicKey.toBytes(),
        message: msgBuffer,
        signature: Buffer.from(agentSig)
    });

    const ixTreasury = Ed25519Program.createInstructionWithPublicKey({
        publicKey: treasuryKp.publicKey.toBytes(),
        message: msgBuffer,
        signature: Buffer.from(treasurySig)
    });

    const txid = await program.methods
        .submitSnapshot(new anchor.BN(snapshot.nonce), stateHashBytes)
        .preInstructions([ixAgent, ixTreasury])
        .accounts({
            channel: chan,
            authority: program.provider.wallet.publicKey,
            treasury: treasuryKp.publicKey,
            ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId
        })
        .rpc({ commitment: txCommitment });

    return { ok: true, txid, commitment: txCommitment, status: txCommitment === 'finalized' ? 'FINALIZED' : 'CONFIRMED' };
};

const depositEscrow = async (provider, { amount, agentTokenAccount, escrowTokenAccount }, { authorityKeypair, commitment } = {}) => {
    const program = buildProgram(provider, authorityKeypair);
    const treasuryKp = requireTreasuryKeypair();
    if (!agentTokenAccount || !escrowTokenAccount) {
        const err = new Error('SOLANA_TOKEN_ACCOUNTS_MISSING');
        err.code = 'SOLANA_TOKEN_ACCOUNTS_MISSING';
        throw err;
    }
    const chan = deriveChannelPda(provider, program.provider.wallet.publicKey, treasuryKp.publicKey);
    const txCommitment = String(commitment || provider.commitment);

    const txid = await program.methods
        .depositEscrow(new anchor.BN(Number(amount || 0)))
        .accounts({
            channel: chan,
            authority: program.provider.wallet.publicKey,
            treasury: treasuryKp.publicKey,
            agentTokenAccount: new PublicKey(agentTokenAccount),
            escrowTokenAccount: new PublicKey(escrowTokenAccount),
            tokenProgram: TOKEN_PROGRAM_ID
        })
        .rpc({ commitment: txCommitment });

    return { ok: true, txid, commitment: txCommitment, status: txCommitment === 'finalized' ? 'FINALIZED' : 'CONFIRMED' };
};

const openDispute = async (provider, { targetNonce }, { authorityKeypair, commitment } = {}) => {
    const program = buildProgram(provider, authorityKeypair);
    const treasuryKp = requireTreasuryKeypair();
    const chan = deriveChannelPda(provider, program.provider.wallet.publicKey, treasuryKp.publicKey);
    const txCommitment = String(commitment || provider.commitment);

    const txid = await program.methods
        .openDispute(new anchor.BN(targetNonce || 0))
        .accounts({
            channel: chan,
            authority: program.provider.wallet.publicKey,
            treasury: treasuryKp.publicKey
        })
        .rpc({ commitment: txCommitment });

    return { ok: true, txid, commitment: txCommitment, status: txCommitment === 'finalized' ? 'FINALIZED' : 'CONFIRMED' };
};

const slash = async (provider, { reason }, { authorityKeypair, commitment } = {}) => {
    const program = buildProgram(provider, authorityKeypair);
    const treasuryKp = requireTreasuryKeypair();
    const chan = deriveChannelPda(provider, program.provider.wallet.publicKey, treasuryKp.publicKey);
    const txCommitment = String(commitment || provider.commitment);

    const escrowTokenAccount = process.env.SOLANA_ESCROW_TOKEN_ACCOUNT || null;
    const treasuryTokenAccount = process.env.SOLANA_TREASURY_TOKEN_ACCOUNT || null;
    if (!escrowTokenAccount || !treasuryTokenAccount) {
        const err = new Error('SOLANA_TOKEN_ACCOUNTS_MISSING');
        err.code = 'SOLANA_TOKEN_ACCOUNTS_MISSING';
        throw err;
    }

    const txid = await program.methods
        .slash(String(reason || 'SLASH'))
        .accounts({
            channel: chan,
            authority: program.provider.wallet.publicKey,
            treasury: treasuryKp.publicKey,
            escrowTokenAccount: new PublicKey(escrowTokenAccount),
            treasuryTokenAccount: new PublicKey(treasuryTokenAccount),
            tokenProgram: TOKEN_PROGRAM_ID
        })
        .signers([treasuryKp])
        .rpc({ commitment: txCommitment });

    return { ok: true, txid, commitment: txCommitment, status: txCommitment === 'finalized' ? 'FINALIZED' : 'CONFIRMED' };
};

module.exports = {
    submitSnapshot,
    depositEscrow,
    openDispute,
    slash,
};

