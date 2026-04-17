const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, SystemProgram, Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const WalletEngine = require('../WalletEngine');

const DEFAULT_PROGRAM_ID = '1exAtcSett1ementProgram11111111111111111111';

const buildIdl = () => ({
    version: '0.1.0',
    name: 'lex_atc_settlement',
    instructions: [
        {
            name: 'submitSnapshot',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: true, isSigner: true },
                { name: 'treasury', isMut: false, isSigner: false },
                { name: 'ixSysvar', isMut: false, isSigner: false },
                { name: 'systemProgram', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'nonce', type: 'u64' },
                { name: 'stateHash', type: 'bytes' }
            ]
        },
        {
            name: 'openDispute',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: true, isSigner: true },
                { name: 'treasury', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'targetNonce', type: 'u64' }
            ]
        },
        {
            name: 'slash',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: false, isSigner: false },
                { name: 'treasury', isMut: true, isSigner: true },
                { name: 'escrowTokenAccount', isMut: true, isSigner: false },
                { name: 'treasuryTokenAccount', isMut: true, isSigner: false },
                { name: 'tokenProgram', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'reason', type: 'string' }
            ]
        }
    ],
    accounts: [
        {
            name: 'stateChannel',
            type: {
                kind: 'struct',
                fields: [
                    { name: 'lastNonce', type: 'u64' },
                    { name: 'stateHash', type: { array: ['u8', 32] } },
                    { name: 'status', type: { defined: 'ChannelStatus' } },
                    { name: 'lastUpdatedAt', type: 'i64' },
                    { name: 'treasuryPubkey', type: 'publicKey' },
                    { name: 'disputeOpenedAt', type: 'i64' },
                    { name: 'disputeTargetNonce', type: 'u64' },
                    { name: 'escrowBalance', type: 'u64' },
                    { name: 'bump', type: 'u8' }
                ]
            }
        }
    ],
    types: [
        {
            name: 'ChannelStatus',
            type: {
                kind: 'enum',
                variants: [
                    { name: 'Active' },
                    { name: 'Disputed' },
                    { name: 'Slashed' },
                    { name: 'Closed' }
                ]
            }
        }
    ]
});

class SolanaSettlementProvider {
    constructor({ enabled, rpcUrl, programId, commitment }) {
        this.enabled = Boolean(enabled);
        this.rpcUrl = rpcUrl || process.env.SOLANA_RPC_URL || null;
        this.programId = new PublicKey(programId || process.env.SOLANA_PROGRAM_ID || DEFAULT_PROGRAM_ID);
        this.commitment = String(commitment || process.env.SOLANA_TX_COMMITMENT || 'finalized');
        this.idl = buildIdl();
    }

    static fromEnv() {
        const enabled = String(process.env.SOLANA_SETTLEMENT_ENABLED || '').toLowerCase() === 'true';
        return new SolanaSettlementProvider({ enabled });
    }

    _assertEnabled() {
        if (!this.enabled) {
            const err = new Error('SOLANA_SETTLEMENT_DISABLED');
            err.code = 'SOLANA_SETTLEMENT_DISABLED';
            throw err;
        }
        if (!this.rpcUrl) {
            const err = new Error('SOLANA_RPC_URL_MISSING');
            err.code = 'SOLANA_RPC_URL_MISSING';
            throw err;
        }
    }

    _buildProgram(authorityKeypair) {
        this._assertEnabled();
        if (!authorityKeypair) {
            const err = new Error('SOLANA_AUTHORITY_KEYPAIR_MISSING');
            err.code = 'SOLANA_AUTHORITY_KEYPAIR_MISSING';
            throw err;
        }

        const connection = new Connection(this.rpcUrl, this.commitment);
        const wallet = new anchor.Wallet(authorityKeypair);
        const provider = new anchor.AnchorProvider(connection, wallet, { commitment: this.commitment });
        return new anchor.Program(this.idl, this.programId, provider);
    }

    _deriveChannelPda(authorityPubkey, treasuryPubkey) {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('channel'), authorityPubkey.toBuffer(), treasuryPubkey.toBuffer()],
            this.programId
        )[0];
    }

    async submitSnapshot(snapshot, { authorityKeypair, commitment } = {}) {
        const program = this._buildProgram(authorityKeypair);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!treasuryKp) {
            const err = new Error('SETTLEMENT_KEYS_MISSING');
            err.code = 'SETTLEMENT_KEYS_MISSING';
            throw err;
        }
        const chan = this._deriveChannelPda(program.provider.wallet.publicKey, treasuryKp.publicKey);
        const txCommitment = String(commitment || this.commitment);
        const stateHashBytes = Buffer.from(String(snapshot.stateHash || ''), 'hex');
        
        if (stateHashBytes.length !== 32 || !treasuryKp) {
            const err = new Error('SOLANA_SNAPSHOT_SIGNATURES_INVALID');
            err.code = 'SOLANA_SNAPSHOT_SIGNATURES_INVALID';
            throw err;
        }

        // Build the expected strict Borsh payload: [channel_id, nonce, state_hash]
        const msgBuffer = Buffer.concat([
            chan.toBuffer(),
            (() => { const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(snapshot.nonce)); return buf; })(),
            stateHashBytes
        ]);

        // Re-sign the Borsh payload so the signatures actually match the onchain strict verification
        const agentSig = require('tweetnacl').sign.detached(msgBuffer, authorityKeypair.secretKey);
        const treasurySig = require('tweetnacl').sign.detached(msgBuffer, treasuryKp.secretKey);

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
    }

    async depositEscrow({ amount, agentTokenAccount, escrowTokenAccount }, { authorityKeypair, commitment } = {}) {
        const program = this._buildProgram(authorityKeypair);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!treasuryKp) {
            const err = new Error('SETTLEMENT_KEYS_MISSING');
            err.code = 'SETTLEMENT_KEYS_MISSING';
            throw err;
        }
        if (!agentTokenAccount || !escrowTokenAccount) {
            const err = new Error('SOLANA_TOKEN_ACCOUNTS_MISSING');
            err.code = 'SOLANA_TOKEN_ACCOUNTS_MISSING';
            throw err;
        }

        const chan = this._deriveChannelPda(program.provider.wallet.publicKey, treasuryKp.publicKey);
        const txCommitment = String(commitment || this.commitment);

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
    }

    async openDispute({ targetNonce }, { authorityKeypair, commitment } = {}) {
        const program = this._buildProgram(authorityKeypair);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!treasuryKp) {
            const err = new Error('SETTLEMENT_KEYS_MISSING');
            err.code = 'SETTLEMENT_KEYS_MISSING';
            throw err;
        }
        const chan = this._deriveChannelPda(program.provider.wallet.publicKey, treasuryKp.publicKey);
        const txCommitment = String(commitment || this.commitment);

        const txid = await program.methods
            .openDispute(new anchor.BN(targetNonce || 0))
            .accounts({
                channel: chan,
                authority: program.provider.wallet.publicKey,
                treasury: treasuryKp.publicKey
            })
            .rpc({ commitment: txCommitment });

        return { ok: true, txid, commitment: txCommitment, status: txCommitment === 'finalized' ? 'FINALIZED' : 'CONFIRMED' };
    }

    async slash({ reason }, { authorityKeypair, commitment } = {}) {
        const program = this._buildProgram(authorityKeypair);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!treasuryKp) {
            const err = new Error('SETTLEMENT_KEYS_MISSING');
            err.code = 'SETTLEMENT_KEYS_MISSING';
            throw err;
        }
        const chan = this._deriveChannelPda(program.provider.wallet.publicKey, treasuryKp.publicKey);
        const txCommitment = String(commitment || this.commitment);

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
    }

    getAuthorityKeypair(agentUuid) {
        const kp = WalletEngine.getAgentKeypair(String(agentUuid));
        if (!kp) {
            const err = new Error('SOLANA_AGENT_KEYPAIR_MISSING');
            err.code = 'SOLANA_AGENT_KEYPAIR_MISSING';
            throw err;
        }
        return kp;
    }
}

module.exports = SolanaSettlementProvider;
