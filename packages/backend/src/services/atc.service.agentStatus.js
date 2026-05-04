const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');

const isAgentPaused = async (svc, uuid) => {
    if (!svc.sharedClient) return false;
    try {
        const map = await svc.sharedClient.getMap(CONSTANTS.MAP_AGENT_COMMANDS);
        const cmd = await map.get(uuid);
        return cmd && cmd.cmd === CONSTANTS.CMD_PAUSE;
    } catch (_e) { 
        return false; 
    }
};

const getAgentStatus = async (svc, { includePosition = false } = {}) => {
    if (!svc.sharedClient) return [];
    try {
        const map = await svc.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
        const entrySet = await map.entrySet();
        const statusList = [];
        const now = Date.now();
        const isolationTasks = (svc.state.isolation?.tasks || []);
        const pendingByAgent = new Map();
        for (const t of isolationTasks) {
            const actor = String(t.actorUuid || '');
            if (!actor) continue;
            if (!pendingByAgent.has(actor)) pendingByAgent.set(actor, []);
            pendingByAgent.get(actor).push(t);
        }

        const settlementChannels = (svc.state.settlement?.channels || []);
        const settlementByAgent = new Map();
        for (const ch of settlementChannels) {
            const channelId = String(ch.channelId || '');
            const parts = channelId.split(':');
            if (parts.length >= 2) settlementByAgent.set(parts[1], ch);
        }

        for (const [uuid, info] of entrySet) {
            if (svc.agents.has(uuid) || (now - info.lastUpdated < 5000)) {
                const agentObj = svc.agents.get(uuid);
                const base = { ...info };
                const enriched = {
                    ...base,
                    id: base.uuid,
                    displayName: agentObj ? agentObj.id : (base.displayName || base.id),
                    priority: (svc.state.priorityAgents || []).includes(uuid),
                    isPaused: await isAgentPaused(svc, uuid),
                };

                const iso = pendingByAgent.get(uuid) || [];
                const hasPending = iso.some(t => String(t.status) === 'PENDING');
                const settlement = settlementByAgent.get(uuid);
                const lastStatus = String(settlement?.lastStatus || '');
                const hasSnap = settlement && settlement.lastNonce !== undefined && settlement.lastNonce !== null;
                let l4Phase = 'SANDBOX';
                if (hasPending) l4Phase = 'SANDBOX';
                else if (lastStatus === 'FINALIZED') l4Phase = 'FINALIZED';
                else if (hasSnap) l4Phase = 'COMMIT';
                enriched.l4Phase = l4Phase;
                enriched.onchainStatus = lastStatus || null;
                enriched.onchainTxid = settlement?.lastTxid || null;

                if (includePosition) {
                    statusList.push(enriched);
                } else {
                    const { position: _position, ...rest } = enriched;
                    statusList.push(rest);
                }
            }
        }
        return statusList.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', undefined, { numeric: true }));
    } catch (e) {
        if (process.env.NODE_ENV !== 'test') {
            logger.error('Failed to get agent status:', e.message);
        }
        return [];
    }
};

module.exports = {
    isAgentPaused,
    getAgentStatus,
};
