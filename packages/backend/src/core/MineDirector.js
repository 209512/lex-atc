// backend/src/core/MineDirector.js
const crypto = require('crypto');
const { LEX_CONSTITUTION, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

class MineDirector {
    constructor(atcService) {
        this.atcService = atcService;
        this.activeChallenges = new Map();
        this.currentDifficulty = LEX_CONSTITUTION?.MINING?.BASE_DIFFICULTY || 1;
        this.history = []; 
        this.lastBlockTime = Date.now();
        this.targetTime = 5000;
    }

    generateChallenge(agentUuid, agentDifficulty) {
        const now = Date.now();
        // Decay difficulty if stalled for more than 20 seconds
        if (now - this.lastBlockTime > 20000 && this.currentDifficulty > 1) {
            this.currentDifficulty = Math.max(1, this.currentDifficulty - 1);
            this.lastBlockTime = now;
            this.atcService.addLog('SYSTEM', `📉 Network stalled. Auto-decay Difficulty -> ${this.currentDifficulty}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
        }

        const challenge = crypto.randomBytes(16).toString('hex');
        // Cap max difficulty to 6 to prevent permanent 10s timeouts
        const difficulty = Math.min(6, Math.max(this.currentDifficulty, agentDifficulty || 1));
        
        const data = {
            challenge,
            difficulty,
            timestamp: now
        };
        this.activeChallenges.set(agentUuid, data);
        return data;
    }

    verifyProof(agentUuid, nonce, solution) {
        const active = this.activeChallenges.get(agentUuid);
        if (!active) return { isValid: false, reason: 'NO_ACTIVE_CHALLENGE' };

        const hash = crypto.createHash('sha256')
            .update(active.challenge + nonce.toString())
            .digest('hex');

        const prefix = '0'.repeat(active.difficulty);
        const isValid = hash.startsWith(prefix) && hash === solution;

        if (isValid) {
            this.activeChallenges.delete(agentUuid);
            this._updateSystemDifficulty();
            return { isValid: true, hash };
        }
        return { isValid: false, reason: 'INVALID_HASH' };
    }
    
    _updateSystemDifficulty() {
        const now = Date.now();
        const elapsed = now - this.lastBlockTime;
        this.history.push(elapsed);
        if (this.history.length > 5) this.history.shift();

        const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;

        if (avg < this.targetTime * 0.6) {
            this.currentDifficulty = Math.min(this.currentDifficulty + 1, 8);
            this.atcService.addLog('SYSTEM', `📈 Network congestion! Difficulty -> ${this.currentDifficulty}`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
        } else if (avg > this.targetTime * 1.6 && this.currentDifficulty > 1) {
            this.currentDifficulty--;
            this.atcService.addLog('SYSTEM', `📉 Network stable. Difficulty -> ${this.currentDifficulty}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
        }
        this.lastBlockTime = now;
    }
}
module.exports = MineDirector;