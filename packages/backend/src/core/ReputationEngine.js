const { LEX_CONSTITUTION } = require('@lex-atc/shared');

class ReputationEngine {
    constructor() {
        this.weights = { success: 0.5, deposit: 0.3, latency: 0.2 };
    }

    calculate(account, stats) {
        const { escrow } = account;
        const { successCount, totalTasks, avgAiLatency } = stats;

        const S = totalTasks > 0 ? (successCount / totalTasks) * 100 : 70;

        const D = Math.min((escrow / LEX_CONSTITUTION.ECONOMY.MIN_ESCROW) * 10, 100);

        const L = Math.max(0, Math.min((avgAiLatency - 2000) / 50, 100));

        const R = (S * this.weights.success) + 
                  (D * this.weights.deposit) - 
                  (L * this.weights.latency);

        return Math.max(5, Math.min(100, R));
    }
}

module.exports = new ReputationEngine();
