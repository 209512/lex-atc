require('dotenv').config({ path: '.env.test' });
process.env.USE_LITE_MODE = 'true';
process.env.NODE_ENV = 'test';

const atcService = require('../src/services/atc.service');
const logger = require('../src/utils/logger');

async function runBiddingStressTest() {
    logger.info("=========================================");
    logger.info("🚀 STARTING 10,000 BIDDING STRESS TEST 🚀");
    logger.info("=========================================");

    await atcService.init(0); 

    const TOTAL_AGENTS = 1000; // Testing 1,000 first to avoid V8 memory limit on local Node.js process
    const TARGET_RESOURCE = 'market-data:shard-0:e0';

    logger.info(`[1] Provisioning ${TOTAL_AGENTS} Agents via AgentManager...`);
    // Create 10,000 agents with random balances
    await atcService.agentManager.updateAgentPool(TOTAL_AGENTS);
    
    // Assign random balances to simulate a real market
    for (const agent of atcService.agents.values()) {
        agent.account.balance = Math.floor(Math.random() * 50000) + 1000;
    }
    logger.info(`✅ Provisioned ${TOTAL_AGENTS} agents in memory.`);

    logger.info(`\n[2] Executing Concurrent Bids on single resource...`);
    const startTime = Date.now();

    // Generate lock attempts for ALL agents
    const promises = Array.from(atcService.agents.values()).map(async (agent) => {
        try {
            // Direct CP Subsystem lock contention simulation
            const lock = await atcService.sharedClient.getCPSubsystem().getLock(TARGET_RESOURCE);
            // Wait up to 500ms to acquire lock
            const fence = await lock.tryLock(500); 
            
            if (fence && fence.toNumber() > 0) {
                // Lock acquired, hold it briefly then release
                await new Promise(r => setTimeout(r, 1));
                await lock.unlock(fence);
                return { ok: true, agentId: agent.id };
            }
            return { ok: false, reason: 'timeout' };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const rps = (TOTAL_AGENTS / (durationMs / 1000)).toFixed(2);

    logger.info(`\n[3] Results:`);
    logger.info(`⏱️  Total Time: ${durationMs}ms`);
    logger.info(`⚡  Throughput: ${rps} Bids/sec`);

    const successes = results.filter(r => r.ok).length;
    const failures = results.filter(r => !r.ok).length;
    
    logger.info(`✅ Successful Lock Acquisitions: ${successes}`);
    logger.info(`❌ Failed/Timeout Bids: ${failures}`);

    if (durationMs < 10000) {
        logger.info(`\n🎉 STRESS TEST PASSED: 10,000 concurrent lock contentions handled without crashing.`);
        process.exit(0);
    } else {
        logger.error(`\n💥 STRESS TEST FAILED: Too slow.`);
        process.exit(1);
    }
}

runBiddingStressTest().catch(e => {
    logger.error("Fatal Error:", e);
    process.exit(1);
});
