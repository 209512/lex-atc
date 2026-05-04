const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { parseSolanaAllowlist } = require('./allowlist');

const verifySolanaSignature = (req) => {
    try {
        let signatures = [];
        let pubkeys = [];
        const timestamp = req.headers['x-timestamp'];

        if (req.headers['x-wallet-signatures'] && req.headers['x-wallet-pubkeys']) {
            signatures = JSON.parse(req.headers['x-wallet-signatures']);
            pubkeys = JSON.parse(req.headers['x-wallet-pubkeys']);
        } else if (req.headers['x-wallet-signature'] && req.headers['x-wallet-pubkey']) {
            signatures = [req.headers['x-wallet-signature']];
            pubkeys = [req.headers['x-wallet-pubkey']];
        }

        if (!signatures.length || !pubkeys.length || signatures.length !== pubkeys.length || !timestamp) return false;

        const now = Date.now();
        if (Math.abs(now - Number(timestamp)) > 300000) return false;

        const nodeEnv = String(process.env.NODE_ENV || 'development');
        const allowlist = parseSolanaAllowlist();

        let payload = req.method === 'GET' ? req.url : '';
        if (req.method !== 'GET') {
            payload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
        }

        const message = `lex-atc-auth|${timestamp}|${payload}`;
        const messageBytes = new TextEncoder().encode(message);

        let validCount = 0;
        const validPubkeys = [];

        for (let i = 0; i < signatures.length; i++) {
            const currentPubkey = pubkeys[i];
            if (nodeEnv === 'production' && (!allowlist || !allowlist.has(currentPubkey))) {
                continue;
            }

            try {
                const signatureBytes = bs58.decode(signatures[i]);
                const publicKeyBytes = new PublicKey(currentPubkey).toBytes();

                if (nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
                    validCount++;
                    validPubkeys.push(currentPubkey);
                }
            } catch (innerErr) {
                void innerErr;
            }
        }

        const isSingleSig = signatures.length === 1;
        const MULTI_SIG_THRESHOLD = isSingleSig ? 1 : Number(process.env.ADMIN_MULTI_SIG_THRESHOLD || 2);

        if (validCount >= MULTI_SIG_THRESHOLD) {
            return { ok: true, pubkeys: validPubkeys, allowlist };
        }
        return false;
    } catch (err) {
        return false;
    }
};

module.exports = { verifySolanaSignature };

