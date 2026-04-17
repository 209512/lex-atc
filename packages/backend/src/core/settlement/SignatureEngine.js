const crypto = require('crypto');
const { ed25519 } = require('@noble/curves/ed25519');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

const toBytes = (v) => {
    if (Buffer.isBuffer(v)) return new Uint8Array(v);
    if (v instanceof Uint8Array) return v;
    if (typeof v === 'string') return new Uint8Array(Buffer.from(v, 'utf8'));
    return new Uint8Array(Buffer.from(String(v), 'utf8'));
};

const sign = (messageBytes, secretKeyBytes64) => {
    const msg = toBytes(messageBytes);
    const sk = secretKeyBytes64 instanceof Uint8Array ? secretKeyBytes64 : new Uint8Array(secretKeyBytes64);
    const privateScalar = sk.slice(0, 32);
    const sig = ed25519.sign(msg, privateScalar);
    return Buffer.from(sig).toString('hex');
};

const verify = (messageBytes, signatureHex, publicKeyBytes32) => {
    const msg = toBytes(messageBytes);
    const sig = new Uint8Array(Buffer.from(String(signatureHex), 'hex'));
    const pk = publicKeyBytes32 instanceof Uint8Array ? publicKeyBytes32 : new Uint8Array(publicKeyBytes32);
    return ed25519.verify(sig, msg, pk);
};

const hashHex = (messageBytes) => sha256(Buffer.from(toBytes(messageBytes))).toString('hex');

module.exports = { sign, verify, hashHex, toBytes };

