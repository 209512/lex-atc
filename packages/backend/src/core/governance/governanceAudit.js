const { v4: uuidv4 } = require('uuid');
const JobQueue = require('../queue/JobQueue');

module.exports = async function audit(engine, action, actorUuid, payload) {
    const shardId = 'RG-0';
    const shardEpoch = engine.atcService?.state?.shards?.[shardId]?.epoch ?? 0;
    const resourceId = engine.atcService?.state?.shards?.[shardId]?.resourceId ?? null;

    JobQueue.add('audit-queue', `audit:${action}`, {
        shardId,
        shardEpoch,
        resourceId,
        fenceToken: null,
        action,
        actorUuid: String(actorUuid),
        correlationId: `gov:${action}:${payload?.proposalId || uuidv4()}`,
        payload: payload || {}
    });
};

