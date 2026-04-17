// src/core/PolicyManager.js
const { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const logger = require('../utils/logger');

class PolicyManager {
    constructor(atcService) {
        this.atcService = atcService;
    }

    async canAgentAcquire(agentId, shardId = null) {
        const state = this.atcService.state;
        
        if (state.globalStop) return false;
        
        const isPaused = await this.atcService.isAgentPaused(agentId);
        if (isPaused) return false;

        if (state.overrideSignal) {
            return agentId === SYSTEM.ADMIN_HOLDER_ID;
        }

        const agent = this.atcService.agents.get(agentId);
        if (agent?.isDraining) {
            return false;
        }

        const sid = shardId || (this.atcService.getShardIdForAgent ? this.atcService.getShardIdForAgent(agentId) : null);
        const shard = sid ? state.shards?.[sid] : null;

        if (shard?.forcedCandidate?.uuid) {
            return String(shard.forcedCandidate.uuid) === String(agentId);
        }

        if (shard?.holder && String(shard.holder) === String(agentId)) {
            return true;
        }

        // Priority Agents have absolute precedence over regular bids
        if (state.priorityAgents && state.priorityAgents.length > 0) {
            const activePriorityAgents = [];
            for (const pid of state.priorityAgents) {
                const exists = this.atcService.agents.has(pid);
                if (exists && !(await this.atcService.isAgentPaused(pid))) {
                    activePriorityAgents.push(pid);
                }
            }
            if (activePriorityAgents.length > 0) {
                if (!activePriorityAgents.includes(agentId)) {
                    return false; // Non-priority agents are blocked
                } else {
                    return true; // Priority agents are allowed immediately
                }
            }
        }

        if (sid && this.atcService.sequencer && typeof this.atcService.sequencer.getHighestBidder === 'function') {
            const highestBidderEntry = await this.atcService.sequencer.getHighestBidder(sid);
            if (highestBidderEntry) {
                const [ticket, bidData] = highestBidderEntry;
                if (String(bidData.uuid) === String(agentId)) {
                    return true;
                }
            }
        }

        return true;
    }

    async togglePriority(id, enable) {
        const current = new Set(this.atcService.state.priorityAgents || []);
        if (enable) current.add(id);
        else current.delete(id);
        
        this.atcService.state.priorityAgents = Array.from(current);
        
        const type = enable ? 'success' : 'warn';
        this.atcService.addLog(id, `⭐ Priority ${enable ? 'Granted' : 'Revoked'}`, type, { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TOGGLE_PRIORITY });

        this.atcService.lockDirector.refreshResourceId();
        this.atcService.emitState();
    }

    async updatePriorityOrder(newOrder) {
        logger.info(`📑 Updating Priority Order: ${newOrder.join(' -> ')}`);
        this.atcService.state.priorityAgents = newOrder;

        newOrder.forEach((id, index) => {
            this.atcService.addLog(id, `📑 Priority Rank Updated: No.${index + 1}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.PRIORITY_ORDER });
        });

        this.atcService.lockDirector.refreshResourceId();
        this.atcService.emitState();
    }
}

module.exports = PolicyManager;
