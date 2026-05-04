const { LOG_CONFIG, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS, normalizeLogMeta } = require('@lex-atc/shared');
const logger = require('../utils/logger');
const CONSTANTS = require('../config/constants');
const db = require('./DatabaseManager');
const crypto = require('crypto');

class LogManager {
    constructor(atcService) {
        this.atcService = atcService;
    }

    addLog(agentId, message, type = 'info', meta = {}) {
        const config = LOG_CONFIG.levels[type] || LOG_CONFIG.levels.info;
        const reset = '\x1b[0m';
        const agentIdStr = agentId ? String(agentId) : 'system';
        const agent = this.atcService.agents.get(agentIdStr);
        
        const displayName = agent ? (agent.id || agent.displayName) : agentIdStr;
        const normalizedMeta = normalizeLogMeta(meta);

        if (process.env.NODE_ENV !== 'test') {
            logger.info(`${config.color}${config.emoji} ${config.tag} [${displayName}]${reset} ${message}`);
        }

        const logEntry = {
            id: `log-${Date.now()}-${crypto.randomUUID()}`,
            agentId: agentIdStr,
            agentName: displayName,
            message,
            timestamp: Date.now(),
            type,
            stage: normalizedMeta.stage || LOG_STAGES.EXECUTED,
            domain: normalizedMeta.domain || LOG_DOMAINS.SYSTEM,
            actionKey: normalizedMeta.actionKey || LOG_ACTIONS.LOG,
        };

        this.atcService.state.logs = [...(this.atcService.state.logs || []), logEntry].slice(-(CONSTANTS.LOG_RETENTION || 2000));
        this.atcService._touchActivity(agentId);
        this.atcService.emitState();
    }

    clearAgentLogs(agentId) {
        const targetId = String(agentId);
        this.atcService.state.logs = this.atcService.state.logs.filter(log => String(log.agentId) !== targetId);
        this.atcService.emitState();
    }

    async recordEvent({ shardId, shardEpoch, resourceId = null, fenceToken = null, action, actorUuid, correlationId = null, payload = {} }) {
        try {
            const sid = String(shardId);
            const globalSeq = await this.atcService.sequencer.nextGlobalSeq();
            const shardSeq = await this.atcService.sequencer.nextShardSeq(sid);
            const cid = correlationId || `g${globalSeq}:${action}:${actorUuid}`;
            await db.appendEvent({
                globalSeq,
                shardId: sid,
                shardSeq,
                shardEpoch: Number(shardEpoch),
                resourceId,
                fenceToken,
                action,
                actorUuid,
                correlationId: cid,
                payload
            });
            return { globalSeq, shardSeq, correlationId: cid };
        } catch (e) {
            logger.error(`[LogManager] Failed to record event: ${e.message}`);
            return null;
        }
    }

    async recordEconomicEvent(agent, { shardId, shardEpoch, resourceId = null, fenceToken = null, action, payload = {} }) {
        const uuid = String(agent?.uuid || agent || '');
        const sid = shardId || this.atcService.getShardIdForAgent(uuid);
        const shard = this.atcService.state.shards?.[sid];
        const epoch = shardEpoch ?? shard?.epoch ?? 0;
        const result = await this.recordEvent({
            shardId: sid,
            shardEpoch: epoch,
            resourceId,
            fenceToken,
            action,
            actorUuid: uuid,
            payload
        });

        const agentObj = typeof agent === 'object' ? agent : this.atcService.agents.get(uuid);
        if (agentObj) {
            await db.saveAgentSnapshot(agentObj, { globalSeq: result.globalSeq });
        }
        return result;
    }
}
module.exports = LogManager;
