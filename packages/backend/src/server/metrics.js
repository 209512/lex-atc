const promClient = require('prom-client');

module.exports = function setupMetrics(app, svc) {
    promClient.register.clear();
    promClient.collectDefaultMetrics({ prefix: 'lex_atc_' });

    const activeAgentsGauge = new promClient.Gauge({
        name: 'lex_atc_active_agents',
        help: 'Number of active AI agents in the system'
    });

    const lockOccupancyGauge = new promClient.Gauge({
        name: 'lex_atc_lock_occupancy_ms',
        help: 'Time in milliseconds the global lock has been held',
        labelNames: ['shard_id', 'holder', 'balance', 'total_tasks']
    });

    const anomalyScoreGauge = new promClient.Gauge({
        name: 'lex_atc_ml_anomaly_score',
        help: 'Latest ML Watcher anomaly score for agents',
        labelNames: ['agent_uuid', 'balance', 'total_tasks']
    });

    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

    app.get('/metrics', asyncRoute(async (_req, res) => {
        activeAgentsGauge.set(svc.agents.size);

        if (svc.state.holder && svc.state.lockAcquiredAt) {
            const holderAgent = svc.agents.get(svc.state.holder);
            const balance = holderAgent ? (holderAgent.account?.balance || 0) : 0;
            const totalTasks = holderAgent ? (holderAgent.stats?.totalTasks || 0) : 0;
            lockOccupancyGauge.labels('RG-0', svc.state.holder, String(balance), String(totalTasks)).set(Date.now() - svc.state.lockAcquiredAt);
        } else {
            lockOccupancyGauge.labels('RG-0', 'none', '0', '0').set(0);
        }

        for (const [uuid, agent] of svc.agents.entries()) {
            if (agent.metrics && agent.metrics.anomalyScore !== undefined) {
                const balance = agent.account?.balance || 0;
                const totalTasks = agent.stats?.totalTasks || 0;
                anomalyScoreGauge.labels(uuid, String(balance), String(totalTasks)).set(agent.metrics.anomalyScore);
            }
        }

        res.set('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
    }));
};

