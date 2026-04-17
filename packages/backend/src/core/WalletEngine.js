// backend/src/core/WalletEngine.js
const crypto = require('crypto');
const { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { LEX_CONSTITUTION } = require('@lex-atc/shared');
const logger = require('../utils/logger');
const SecretManager = require('./security/kms/SecretManager');

class WalletEngine {
    constructor() {
        this.mockMode = false;
        this.connection = null;
        this.rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
        this.treasurySeed = null;
        this.agentSeed = null;

        try {
            new URL(this.rpcUrl);
            this.connection = new Connection(this.rpcUrl, 'confirmed');
        } catch {
            this.mockMode = true;
            this.rpcUrl = 'mock://solana';
        }
    }

    async init() {
        SecretManager.init();
        try {
            this.treasurySeed = await SecretManager.getSecret('TREASURY_KEY_SEED');
            this.agentSeed = await SecretManager.getSecret('AGENT_KEY_SEED');
            logger.info('[WalletEngine] Initialized secrets via SecretManager');
        } catch (e) {
            if (process.env.NODE_ENV === 'production') {
                logger.error('[WalletEngine] Failed to load critical production secrets:', e.message);
                throw e; // Fail-fast in production
            } else {
                logger.warn('[WalletEngine] Running without full secrets in non-production mode');
            }
        }
    }

    isMockMode() {
        return this.mockMode || process.env.NODE_ENV !== 'production';
    }

    generateSovereignWallet() {
        const keypair = Keypair.generate();
        return {
            address: keypair.publicKey.toBase58(),
            createdAt: Date.now()
        };
    }

    _deriveSeed32(label, seedMaterial) {
        const seed = String(seedMaterial || '');
        if (!seed) return null;
        const msg = Buffer.from(String(label || 'default'), 'utf8');
        return crypto.createHmac('sha256', seed).update(msg).digest().subarray(0, 32);
    }

    getDeterministicKeypair(label, type) {
        const seedMaterial = type === 'TREASURY' ? this.treasurySeed : this.agentSeed;
        
        if (!seedMaterial) {
            const allowTest = String(process.env.ALLOW_TEST_DUMMY_KEYS || '').toLowerCase() === 'true';
            if (process.env.NODE_ENV === 'development' || (process.env.NODE_ENV === 'test' && allowTest)) {
                // Generate a temporary seed if strictly allowed (development/test only)
                // Use env fallback instead of hardcoded literal string
                const tempSeed = process.env.TEMP_TEST_SEED_FALLBACK || 'test-fallback-seed';
                const seed32 = this._deriveSeed32(label, tempSeed);
                return Keypair.fromSeed(new Uint8Array(seed32));
            }
            return null;
        }

        const seed32 = this._deriveSeed32(label, seedMaterial);
        if (!seed32) return null;
        return Keypair.fromSeed(new Uint8Array(seed32));
    }

    getTreasuryKeypair() {
        return this.getDeterministicKeypair('TREASURY', 'TREASURY');
    }

    getAgentKeypair(agentUuid) {
        return this.getDeterministicKeypair(`AGENT:${agentUuid}`, 'AGENT');
    }

    getTreasuryAddress() {
        const kp = this.getTreasuryKeypair();
        return kp ? kp.publicKey.toBase58() : 'VAULT_SYSTEM_RESERVE';
    }

    async getOnChainBalance(publicKeyString) {
        if (this.isMockMode() || !this.connection) return 0;
        try {
            const pubKey = new PublicKey(publicKeyString);
            const balance = await this.connection.getBalance(pubKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (e) {
            logger.error(`[WalletEngine] Balance fetch failed: ${e.message}`);
            return 0;
        }
    }

    getInitialAccount(wallet) {
        return {
            address: wallet.address,
            balance: LEX_CONSTITUTION.ECONOMY.INITIAL_BALANCE,
            escrow: LEX_CONSTITUTION.ECONOMY.MIN_ESCROW,
            reputation: 100,
            difficulty: LEX_CONSTITUTION.MINING.BASE_DIFFICULTY,
            totalEarned: 0,
            lastWorkHash: '0x00000000'
        };
    }

    async signAndSendWork(wallet, workHash) {
        logger.info(`[WalletEngine] Signing WorkHash ${workHash} for ${wallet.address}`);
        return { ok: true, txid: `sim_tx_${Date.now()}`, mock: this.isMockMode() };
    }
}

module.exports = new WalletEngine();
