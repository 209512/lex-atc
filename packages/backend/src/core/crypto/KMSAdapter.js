class KeyProvider {
    async sign(messageBytes, keyId) {
        throw new Error('Not implemented');
    }
    
    async getPublicKey(keyId) {
        throw new Error('Not implemented');
    }
}

class MockKMSAdapter extends KeyProvider {
    constructor({ seed } = {}) {
        super();
        const crypto = require('crypto');
        this.nacl = require('tweetnacl');
        const envSeed = process.env.MOCK_KMS_SEED;
        const baseSeed = seed || envSeed || (process.env.NODE_ENV === 'test' ? 'test' : (process.env.NODE_ENV === 'development' ? 'dev' : null));
        if (!baseSeed) {
            throw new Error('MOCK_KMS_SEED_MISSING');
        }
        const seed32 = crypto.createHash('sha256').update(String(baseSeed)).digest().subarray(0, 32);
        const kp = this.nacl.sign.keyPair.fromSeed(new Uint8Array(seed32));
        this.secretKey = kp.secretKey;
        this.publicKey = kp.publicKey;
    }

    async sign(messageBytes, keyId) {
        return this.nacl.sign.detached(messageBytes, this.secretKey);
    }

    async getPublicKey(keyId) {
        return this.publicKey;
    }
}

class AwsKMSAdapter extends KeyProvider {
    constructor(client) {
        super();
        this.client = client; 
    }
    
    async sign(messageBytes, keyId) {
        throw new Error('AWS KMS Not fully configured');
    }

    async getPublicKey(keyId) {
        throw new Error('AWS KMS Not fully configured');
    }
}

module.exports = { KeyProvider, MockKMSAdapter, AwsKMSAdapter };
