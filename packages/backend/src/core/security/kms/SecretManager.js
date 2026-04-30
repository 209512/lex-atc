const logger = require('../../../utils/logger');
const crypto = require('crypto');

class LocalSecretProvider {
    constructor() {
        this._generated = new Map();
    }

    _isLocalDev() {
        return String(process.env.ALLOW_DEV_SEED_FALLBACK || '').toLowerCase() === 'true';
    }

    _getSeedFallback(key) {
        const env = String(process.env.NODE_ENV || 'development').toLowerCase();
        if (env === 'test') {
            return key === 'TREASURY_KEY_SEED' ? 'lex-atc-test-stable-seed' : 'lex-atc-test-agent-seed';
        }
        if (this._isLocalDev()) {
            return key === 'TREASURY_KEY_SEED' ? 'lex-atc-dev-stable-seed' : 'lex-atc-dev-agent-seed';
        }
        const existing = this._generated.get(key);
        if (existing) return existing;
        const generated = crypto.randomBytes(32).toString('hex');
        this._generated.set(key, generated);
        logger.warn(`[SecretManager] Generated ephemeral non-local seed for ${key}`);
        return generated;
    }

    async getSecret(key) {
        if (key === 'TREASURY_KEY_SEED') {
            return process.env.TREASURY_KEY_SEED || (process.env.NODE_ENV !== 'production' ? this._getSeedFallback(key) : null);
        }
        if (key === 'AGENT_KEY_SEED') {
            return process.env.AGENT_KEY_SEED || (process.env.NODE_ENV !== 'production' ? this._getSeedFallback(key) : null);
        }
        return process.env[key] || null;
    }
}

class AwsKmsSecretProvider {
    constructor() {
        // Initialize AWS Secrets Manager client here in a real scenario
        // e.g., this.client = new SecretsManagerClient({ region: 'us-east-1' });
        logger.info('[SecretManager] Initialized AWS Secrets Manager adapter');
    }

    async getSecret(key) {
        // const command = new GetSecretValueCommand({ SecretId: key });
        // const response = await this.client.send(command);
        // return response.SecretString;
        
        // For now, fail-fast if environment doesn't provide it, simulating secure retrieval
        const value = process.env[key];
        if (!value) {
            logger.error(`[SecretManager] Missing critical production secret: ${key}`);
            throw new Error(`Missing critical production secret: ${key}`);
        }
        return value;
    }
}

class SecretManager {
    constructor() {
        this.provider = null;
    }

    init() {
        const env = String(process.env.NODE_ENV || 'development').toLowerCase();
        // Use AWS provider for production, otherwise local mock provider
        if (env === 'production') {
            this.provider = new AwsKmsSecretProvider();
        } else {
            this.provider = new LocalSecretProvider();
        }
    }

    async getSecret(key) {
        if (!this.provider) this.init();
        return await this.provider.getSecret(key);
    }
}

module.exports = new SecretManager();
