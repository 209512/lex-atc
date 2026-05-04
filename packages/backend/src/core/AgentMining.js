const path = require('path');
const Piscina = require('piscina');
const CONSTANTS = require('../config/constants');

let miningWorkerPool = null;

function getMiningWorkerPool() {
    if (!miningWorkerPool) {
        miningWorkerPool = new Piscina({
            filename: path.resolve(__dirname, 'miningWorker.js'),
            maxThreads: Math.max(1, require('os').cpus().length - 1),
            idleTimeout: 30000,
        });
    }
    return miningWorkerPool;
}

async function solveChallenge(agent, { challenge, difficulty }) {
    if (agent._abortController) agent._abortController.abort();
    agent._abortController = new AbortController();

    try {
        return await getMiningWorkerPool().run(
            { challenge, difficulty, yieldStep: CONSTANTS.MINING_YIELD_STEP || 1000 },
            { signal: agent._abortController.signal }
        );
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('MINING_ABORTED');
        }
        throw err;
    }
}

async function destroyPool() {
    if (!miningWorkerPool) return;
    try { await miningWorkerPool.destroy(); } catch (e) {
        const logger = require('../utils/logger');
        logger.debug(`[Agent] Worker pool destroy error: ${e.message}`);
    }
    miningWorkerPool = null;
}

module.exports = {
    solveChallenge,
    destroyPool,
};

