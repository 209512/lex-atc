const req = require;
const { PublicKey } = req('@solana/web3.js');
const WalletEngine = require('../WalletEngine');
const { DEFAULT_PROGRAM_ID, buildIdl } = require('./solanaProvider/idl');
const { assertEnabled } = require('./solanaProvider/program');
const tx = require('./solanaProvider/tx');

class SolanaSettlementProvider {
    constructor({ enabled = false, rpcUrl = null, programId = null, commitment = null } = {}) {
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
        return assertEnabled(this);
    }

    async submitSnapshot(snapshot, { authorityKeypair, commitment } = /** @type {any} */ ({})) {
        return tx.submitSnapshot(this, snapshot, { authorityKeypair, commitment });
    }

    async depositEscrow({ amount, agentTokenAccount, escrowTokenAccount }, { authorityKeypair, commitment } = /** @type {any} */ ({})) {
        return tx.depositEscrow(this, { amount, agentTokenAccount, escrowTokenAccount }, { authorityKeypair, commitment });
    }

    async openDispute({ targetNonce }, { authorityKeypair, commitment } = /** @type {any} */ ({})) {
        return tx.openDispute(this, { targetNonce }, { authorityKeypair, commitment });
    }

    async slash({ reason }, { authorityKeypair, commitment } = /** @type {any} */ ({})) {
        return tx.slash(this, { reason }, { authorityKeypair, commitment });
    }

    getAuthorityKeypair(agentUuid) {
        const kp = WalletEngine.getAgentKeypair(String(agentUuid));
        if (!kp) {
            const err = new Error('SOLANA_AGENT_KEYPAIR_MISSING');
            /** @type {any} */ (err).code = 'SOLANA_AGENT_KEYPAIR_MISSING';
            throw err;
        }
        return kp;
    }
}

module.exports = SolanaSettlementProvider;
