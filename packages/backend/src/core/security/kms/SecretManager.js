const logger = require('../../../utils/logger');

class LocalSecretProvider {
    async getSecret(key) {
        if (key === 'TREASURY_KEY_SEED') {
            return process.env.TREASURY_KEY_SEED || (process.env.NODE_ENV !== 'production' ? 'lex-atc-dev-stable-seed' : null);
        }
        if (key === 'AGENT_KEY_SEED') {
            return process.env.AGENT_KEY_SEED || (process.env.NODE_ENV !== 'production' ? 'lex-atc-dev-agent-seed' : null);
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
        // In a real scenario, this would fetch from AWS:
        // const command = new GetSecretValueCommand({ SecretId: key });
        // const response = await this.client.send(command);
        // return response.SecretString;
        
        // For now, fail-fast if environment doesn't provide it, simulating secure retrieval
        const value = process.env[key];
        if (!value) {
            throw new Error(`[SecretManager] Missing critical production secret: ${key}`);
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