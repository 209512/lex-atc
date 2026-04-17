// src/core/crypto/ZkProofGenerator.js
const crypto = require('crypto');
const nacl = require('tweetnacl');
const WalletEngine = require('../WalletEngine');
const { canonicalStringify } = require('../settlement/CanonicalJson');

class ZkProofGenerator {
    /**
     * Generates an execution attestation for the given payload.
     */
    static async generateProof(payload, opts = {}) {
        const signer = opts.signerKeypair || WalletEngine.getDeterministicKeypair('GOVERNANCE', 'GOVERNANCE_KEY_SEED');
        if (!signer) {
            if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
                throw new Error('GOVERNANCE_KEY_SEED_MISSING');
            }
            return { proof: Buffer.alloc(0), publicInputs: Buffer.alloc(0), signerPubkey: Buffer.alloc(0), mode: 'DISABLED' };
        }

        const msg = canonicalStringify(payload);
        const publicInputs = crypto.createHash('sha256').update(msg).digest();
        const proof = nacl.sign.detached(new Uint8Array(publicInputs), signer.secretKey);

        return {
            proof: Buffer.from(proof),
            publicInputs: Buffer.from(publicInputs),
            signerPubkey: Buffer.from(signer.publicKey.toBytes ? signer.publicKey.toBytes() : signer.publicKey),
            mode: 'ED25519_ATTESTATION'
        };
    }
}

module.exports = ZkProofGenerator;
