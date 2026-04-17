// backend/src/core/AgentManager.js
const Agent = require('./Agent');
const CONSTANTS = require('../config/constants');
const hazelcastManager = require('./HazelcastManager');
const { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const logger = require('../utils/logger');

class AgentManager {
    constructor(atcService) {
        this.atcService = atcService;
        this.scalingInProgress = false;
        this.updateTimeout = null;
    }

    stop() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        if (this.atcService.treasury && typeof this.atcService.treasury.stop === 'function') {
            this.atcService.treasury.stop();
        }
    }

    async stopAll() {
        this.stop();
        const currentAgents = Array.from(this.atcService.agents.values());
        await Promise.allSettled(currentAgents.map(a => this.terminateAgent(a.uuid, true)));
        
        try {
            const Agent = require('./Agent');
            if (Agent.destroyPool) await Agent.destroyPool();
        } catch (e) {
            logger.debug(`[AgentManager] Pool destruction error: ${e.message}`);
        }
    }

    async updateAgentPool(targetCount) {
        if (targetCount > CONSTANTS.MAX_AGENT_COUNT) targetCount = CONSTANTS.MAX_AGENT_COUNT;
        
        if (this.updateTimeout) clearTimeout(this.updateTimeout);
        
        // Use a simple promise that resolves when scaling completes
        return new Promise((resolve, reject) => {
            this.updateTimeout = setTimeout(() => {
                this._executeScaling(targetCount)
                    .then(() => resolve(true))
                    .catch(err => {
                        logger.error("[AgentManager] Scaling Error:", err);
                        reject(err);
                    });
            }, CONSTANTS.UPDATE_POOL_DELAY || 500);
        });
    }

    async _executeScaling(targetCount) {
        if (this.scalingInProgress) return;
        this.scalingInProgress = true;

        try {
            const priorityUuids = this.atcService.state.priorityAgents || [];
            const currentAgents = Array.from(this.atcService.agents.values());
            const currentCount = currentAgents.length;

            if (currentCount > targetCount) {
                const removable = currentAgents
                    .filter(a => !priorityUuids.includes(a.uuid))
                    .sort((a, b) => {
                        const numA = parseInt(a.id.match(/\d+/)?.[0]) || 0;
                        const numB = parseInt(b.id.match(/\d+/)?.[0]) || 0;
                        return numB - numA;
                    });

                const toRemove = removable.slice(0, currentCount - targetCount);
                const results = await Promise.allSettled(toRemove.map(a => this.terminateAgent(a.uuid)));
                results.forEach((res, i) => {
                    if (res.status === 'rejected') {
                        logger.error(`[AgentManager] Failed to terminate agent ${toRemove[i].uuid}:`, res.reason);
                    }
                });
            } 
            else if (currentCount < targetCount) {
                const tasks = [];
                let needed = targetCount - currentCount;
                let candidateNum = 1;
                const currentNames = currentAgents.map(a => a.id);

                while (tasks.length < needed && candidateNum <= (CONSTANTS.MAX_CANDIDATE_NUMBER || 100)) {
                    const name = `Agent-${candidateNum}`;
                    if (!currentNames.includes(name)) {
                        tasks.push(this._spawnAgent(name));
                    }
                    candidateNum++;
                }
                const results = await Promise.allSettled(tasks);
                results.forEach((res, i) => {
                    if (res.status === 'rejected') {
                        logger.error(`[AgentManager] Failed to start agent:`, res.reason);
                    }
                });
            }
        } finally { 
            this.scalingInProgress = false; 
            this.atcService.state.activeAgentCount = this.atcService.agents.size;
            this.atcService.state.trafficIntensity = this.atcService.agents.size;
            this.atcService.emitState();
        }
    }

    async _spawnAgent(name, config = null) {
        const finalConfig = config || { 
            provider: process.env.DEFAULT_PROVIDER || 'mock', 
            model: process.env.DEFAULT_MODEL || SYSTEM.DEFAULT_AGENT_MODEL
        };
        
        const agent = new Agent(name, this.atcService, finalConfig, this.atcService.sharedClient);
        this.atcService.agents.set(agent.uuid, agent);
        this.atcService.agentConfigs.set(agent.uuid, finalConfig);
        
        return agent.start().catch(err => {
            this.atcService.addLog('SYSTEM', `❌ Fail ${name}: ${err.message}`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.SPAWN_AGENT });
            return this.terminateAgent(agent.uuid);
        });
    }

    async terminateAgent(uuid, force = false) {
        const agent = this.atcService.agents.get(uuid);
        if (!agent) return false;

        // Graceful Drain Logic
        if (!force) {
            const shardId = this.atcService.getShardIdForAgent(uuid);
            const shard = this.atcService.state.shards?.[shardId];
            
            // Check if agent holds the lock
            if (shard && shard.holder === uuid) {
                this.atcService.addLog('SYSTEM', `⏳ Draining ${agent.id} (waiting for lock release)`, 'warn', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
                agent.isDraining = true; // Mark as draining
                
                // Wait for up to 3 seconds for graceful release
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    const currentShard = this.atcService.state.shards?.[shardId];
                    if (!currentShard || currentShard.holder !== uuid) {
                        break; // Released successfully
                    }
                }
                
                // If still holds lock after timeout, force eviction via epoch bump
                const finalShard = this.atcService.state.shards?.[shardId];
                if (finalShard && finalShard.holder === uuid) {
                    this.atcService.addLog('SYSTEM', `🚨 Hard eviction timeout for ${agent.id}`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
                    await this.atcService._bumpEpoch(shardId, 'GRACEFUL_DRAIN_TIMEOUT', null);
                    this.atcService.treasury.applySlashing(agent, 'DRAIN_TIMEOUT_EVICTION');
                }
            }
        }
        
        try {
            await agent.stop();
        } catch (e) {
            logger.error(`[AgentManager] Failed to stop agent ${uuid}:`, e);
        }

        try {
            const client = require('./HazelcastManager').getClient();
            if (client) {
                const cmdMap = await client.getMap(require('../config/constants').MAP_AGENT_COMMANDS);
                await cmdMap.remove(uuid);
            }
        } catch (e) {
            // ignore
        }

        this.atcService.agents.delete(uuid);
        this.atcService.agentConfigs.delete(uuid);
        this.atcService.state.priorityAgents = (this.atcService.state.priorityAgents || []).filter(uid => uid !== uuid);

        this.atcService.clearAgentLogs(uuid);
        this.atcService.addLog('SYSTEM', `🗑️ ${agent.id} removed from traffic`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
        
        // Always update state and emit so the frontend UI (Agent count, radar) reflects the removal immediately
        this.atcService.state.activeAgentCount = this.atcService.agents.size;
        this.atcService.state.trafficIntensity = this.atcService.agents.size;
        this.atcService.emitState();
        
        return true;
    }

    async renameAgent(uuid, newName) {
        const agent = this.atcService.agents.get(uuid);
        if (!agent) return false;

        try {
            const oldName = agent.id;
            this.atcService.addLog(uuid, `📝 Callsign Changed: ${oldName} -> ${newName}`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.RENAME_AGENT });
            const client = hazelcastManager.getClient();
            const statusMap = await client.getMap(CONSTANTS.MAP_AGENT_STATUS);
            const currentStatus = await statusMap.get(uuid);

            if (currentStatus) {
                await statusMap.put(uuid, { ...currentStatus, id: newName, displayName: newName, displayId: newName });
            }
            
            agent.id = newName;
            
            if (typeof agent.updateStatus === 'function') await agent.updateStatus();
            this.atcService.emitState();
            return true;
        } catch (err) {
            logger.error(`Rename failed for ${uuid}:`, err);
            return false;
        }
    }

    async pauseAgent(uuid, pause) {
        const client = hazelcastManager.getClient();
        if (client) {
            try {
                const map = await client.getMap(CONSTANTS.MAP_AGENT_COMMANDS);
                if (pause) {
                    await map.put(uuid, { cmd: CONSTANTS.CMD_PAUSE });
                    this.atcService.addLog(uuid, "⏸️ Task Suspended", "system", { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.PAUSE_AGENT });
                } else {
                    await map.remove(uuid);
                    this.atcService.addLog(uuid, "▶️ Task Resumed", "system", { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.RESUME_AGENT });
                }
                this.atcService.emitState();
            } catch (err) {
                logger.error(`Pause error for ${uuid}:`, err);
            }
        }
    }
}

module.exports = AgentManager;
