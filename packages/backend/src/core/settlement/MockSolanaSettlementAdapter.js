const { Transaction, SystemProgram, sendAndConfirmTransaction, PublicKey, ComputeBudgetProgram, AddressLookupTableProgram } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const WalletEngine = require('../WalletEngine');
const SolanaSettlementAdapter = require('./SolanaSettlementAdapter');

// Simulated program ID for Lex ATC Settlement
const PROGRAM_ID = new PublicKey('1exAtcSett1ementProgram11111111111111111111');

const logger = require('../../utils/logger');

class MockSolanaSettlementAdapter extends SolanaSettlementAdapter {
    constructor() {
        super();
        this.program = null;
    }

    async init() {
        logger.info('[MockSolana] Initialized (Simulation Mode)');
    }

    _getProgram() {
        if (this.program) return this.program;
        if (!WalletEngine.connection || WalletEngine.isMockMode()) return null;

        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!treasuryKp) return null;

        const provider = new anchor.AnchorProvider(
            WalletEngine.connection,
            new anchor.Wallet(treasuryKp),
            { commitment: 'confirmed' }
        );
        
        // Use a dummy IDL for now since we are still simulating the contract calls on-chain
        const idl = {
            version: "0.1.0",
            name: "lex_atc_settlement",
            instructions: [
                {
                    name: "submitSnapshot",
                    accounts: [
                        { name: "channel", isMut: true, isSigner: false },
                        { name: "authority", isMut: true, isSigner: true }
                    ],
                    args: [
                        { name: "nonce", type: "u64" },
                        { name: "stateHash", type: "string" }
                    ]
                },
                {
                    name: "openDispute",
                    accounts: [
                        { name: "channel", isMut: true, isSigner: false },
                        { name: "authority", isMut: true, isSigner: true }
                    ],
                    args: [
                        { name: "targetNonce", type: "u64" }
                    ]
                },
                {
                    name: "slash",
                    accounts: [
                        { name: "channel", isMut: true, isSigner: false },
                        { name: "authority", isMut: true, isSigner: true }
                    ],
                    args: [
                        { name: "reason", type: "string" }
                    ]
                }
            ]
        };

        this.program = new anchor.Program(idl, PROGRAM_ID, provider);
        return this.program;
    }

    async submitSnapshot(snapshot) {
        if (WalletEngine.isMockMode() || !WalletEngine.connection) {
            return { ok: true, txid: `sim_settle_${snapshot.channelId}_${snapshot.nonce}_${Date.now()}` };
        }

        try {
            const program = this._getProgram();
            if (!program) {
                logger.warn('[SolanaAdapter] Missing anchor program, falling back to mock');
                return { ok: true, txid: `sim_settle_${snapshot.channelId}_${snapshot.nonce}_${Date.now()}` };
            }

            // Derive channel PDA or use a dummy pubkey for simulation
            const [channelPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("channel"), Buffer.from(snapshot.channelId)],
                program.programId
            );

            // Execute Anchor smart contract instruction with Priority Fees
            const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: parseInt(process.env.SOLANA_PRIORITY_FEE_MICRO_LAMPORTS || '50000', 10)
            });
            const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 200000
            });

            // Address Lookup Table (LUT) logic for optimizing large txs
            let lutAccounts = [];
            if (process.env.SOLANA_LUT_ADDRESS) {
                try {
                    const lutPubKey = new PublicKey(process.env.SOLANA_LUT_ADDRESS);
                    const lutAccount = await program.provider.connection.getAddressLookupTable(lutPubKey);
                    if (lutAccount && lutAccount.value) {
                        lutAccounts.push(lutAccount.value);
                    }
                } catch (lutErr) {
                    logger.warn('[SolanaAdapter] Failed to fetch LUT, proceeding without it:', lutErr.message);
                }
            }

            const tx = new Transaction().add(priorityFeeIx, computeLimitIx);
            
            const methodBuilder = program.methods.submitSnapshot(
                new anchor.BN(snapshot.nonce),
                snapshot.stateHash
            ).accounts({
                channel: channelPda,
                authority: program.provider.wallet.publicKey,
            });
            
            tx.add(await methodBuilder.instruction());

            const txid = await program.provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
            
            return { ok: true, txid };
        } catch (error) {
            logger.error('[SolanaAdapter] submitSnapshot failed:', error);
            // If the simulated program doesn't exist on-chain, fallback to mock tx
            if (error.message.includes('not found') || error.message.includes('Signature verification')) {
                 return { ok: true, txid: `fallback_sim_settle_${snapshot.channelId}_${Date.now()}` };
            }
            return { ok: false, error: error.message };
        }
    }

    async openDispute(dispute) {
        if (WalletEngine.isMockMode() || !WalletEngine.connection) {
            return { ok: true, txid: `sim_dispute_${dispute.channelId}_${Date.now()}` };
        }

        try {
            const program = this._getProgram();
            if (!program) return { ok: true, txid: `sim_dispute_${dispute.channelId}_${Date.now()}` };

            const [channelPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("channel"), Buffer.from(dispute.channelId)],
                program.programId
            );

            const txid = await program.methods.openDispute(
                new anchor.BN(dispute.targetNonce || 0)
            )
            .accounts({
                channel: channelPda,
                authority: program.provider.wallet.publicKey,
            })
            .rpc();
            
            return { ok: true, txid };
        } catch (error) {
            logger.error('[SolanaAdapter] openDispute failed:', error);
            if (error.message.includes('not found')) {
                 return { ok: true, txid: `fallback_sim_dispute_${dispute.channelId}_${Date.now()}` };
            }
            return { ok: false, error: error.message };
        }
    }

    async slash(slashing) {
        if (WalletEngine.isMockMode() || !WalletEngine.connection) {
            return { ok: true, txid: `sim_slash_${slashing.channelId}_${Date.now()}` };
        }

        try {
            const program = this._getProgram();
            if (!program) return { ok: true, txid: `sim_slash_${slashing.channelId}_${Date.now()}` };

            const [channelPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("channel"), Buffer.from(slashing.channelId)],
                program.programId
            );

            const txid = await program.methods.slash(
                slashing.reason || 'SLASH'
            )
            .accounts({
                channel: channelPda,
                authority: program.provider.wallet.publicKey,
            })
            .rpc();
            
            return { ok: true, txid };
        } catch (error) {
            logger.error('[SolanaAdapter] slash failed:', error);
            if (error.message.includes('not found')) {
                 return { ok: true, txid: `fallback_sim_slash_${slashing.channelId}_${Date.now()}` };
            }
            return { ok: false, error: error.message };
        }
    }
}

module.exports = MockSolanaSettlementAdapter;

