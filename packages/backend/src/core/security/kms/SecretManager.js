const logger = require('../../../utils/logger');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const parseCommandSpec = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (!s.startsWith('[')) throw new Error('Command spec must be a JSON array');
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Command spec must be a non-empty JSON array');
    const args = parsed.map(v => String(v));
    if (!args[0]) throw new Error('Command spec must include an executable');
    return { exec: args[0], args: args.slice(1) };
};

const runJsonCommand = ({ spec, envName, timeoutMs = 15000 }) => {
    if (!spec) return null;
    const res = spawnSync(spec.exec, spec.args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    if (res.status !== 0) {
        throw new Error(`${envName} failed`);
    }
    return String(res.stdout || '').trim();
};

class LocalSecretProvider {
    constructor() {
        this._generated = new Map();
    }

    _isLocalDev() {
        const env = String(process.env.NODE_ENV || 'development').toLowerCase();
        const explicit = process.env.ALLOW_DEV_SEED_FALLBACK;
        if (explicit !== undefined) return String(explicit || '').toLowerCase() === 'true';
        if (env === 'development') return true;
        return false;
    }

    _getSeedFallback(key) {
        const env = String(process.env.NODE_ENV || 'development').toLowerCase();
        const derived = (scope) => crypto.createHash('sha256').update(`lex-atc|${scope}|${key}`).digest('hex');
        if (env === 'test') {
            return derived('test');
        }
        if (this._isLocalDev()) {
            return derived('dev');
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

const loadSecretsBundle = () => {
    const inline = process.env.SECRETS_JSON;
    if (inline && String(inline).trim().startsWith('{')) {
        try {
            const obj = JSON.parse(String(inline));
            if (obj && typeof obj === 'object') return obj;
        } catch {}
        throw new Error('SECRETS_JSON is not valid JSON');
    }
    const cmd = process.env.SECRETS_CMD;
    if (cmd && String(cmd).trim().length > 0) {
        const stdout = runJsonCommand({ spec: parseCommandSpec(cmd), envName: 'SECRETS_CMD' });
        try {
            const obj = JSON.parse(String(stdout || '').trim());
            if (obj && typeof obj === 'object') return obj;
        } catch {}
        throw new Error('SECRETS_CMD must output JSON');
    }
    return null;
};

class BundleSecretProvider {
    constructor(bundle) {
        this.bundle = bundle || {};
    }

    async getSecret(key) {
        const value = this.bundle[key];
        if (!value) {
            logger.error(`[SecretManager] Missing critical production secret: ${key}`);
            throw new Error(`Missing critical production secret: ${key}`);
        }
        return value;
    }
}

class EnvSecretProvider {
    constructor() {
        logger.info('[SecretManager] Initialized env secret provider');
    }

    async getSecret(key) {
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
        if (env === 'production') {
            const bundle = loadSecretsBundle();
            if (bundle) {
                logger.info('[SecretManager] Initialized bundle secret provider');
                this.provider = new BundleSecretProvider(bundle);
            } else {
                this.provider = new EnvSecretProvider();
            }
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
