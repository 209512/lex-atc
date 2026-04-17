const crypto = require('crypto');

module.exports = async ({ challenge, difficulty, yieldStep }) => {
    let nonce = 0;
    const prefix = '0'.repeat(difficulty);
    const mineStart = Date.now();
    
    return new Promise((resolve) => {
        function mineChunk() {
            const endNonce = nonce + yieldStep;
            for (; nonce < endNonce; nonce++) {
                if (Date.now() - mineStart >= 10000) {
                    // 10초 타임아웃
                    return resolve({ nonce, solution: null });
                }
                
                const hash = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
                if (hash.startsWith(prefix)) {
                    return resolve({ nonce, solution: hash });
                }
            }
            
            // 다음 청크 스케줄링
            setImmediate(mineChunk);
        }

        mineChunk();
    });
};
