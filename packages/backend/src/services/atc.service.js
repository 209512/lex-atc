// src/services/atc.service.js
const { EventEmitter } = require('events');
const hazelcastManager = require('../core/HazelcastManager');
const AgentManager = require('../core/AgentManager');
const LockDirector = require('../core/LockDirector');
const PolicyManager = require('../core/PolicyManager');
const StateManager = require('../core/StateManager');
const Treasury = require('../core/Treasury');
const ShardedSequencer = require('../core/ShardedSequencer');
const GovernanceEngine = require('../core/governance/GovernanceEngine');
const LogManager = require('../core/LogManager');
const SettlementEngine = require('../core/settlement/SettlementEngine');
const IsolationPolicyEngine = require('../core/isolation/IsolationPolicyEngine');
const TicketManager = require('../core/TicketManager');
const MineDirector = require('../core/MineDirector');
const JobQueue = require('../core/queue/JobQueue');
const logger = require('../utils/logger');
const CONSTANTS = require('../config/constants');
const { EVENT_TYPES, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const db = require('../core/DatabaseManager');

const WalletEngine = require('../core/WalletEngine');

class ATCService extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map();
        this.agentConfigs = new Map();
        this._lastActivityAt = new Map();

        this.state = {
            resourceId: `${CONSTANTS.LOCK_NAME}-${Date.now()}`,
            holder: null,
            waitingAgents: [],
            logs: [],
            collisionCount: 0,
            overrideSignal: false,
            fencingToken: null,
            latency: 0,
            activeAgentCount: 0,
            timestamp: Date.now(),
            globalStop: false,
            priorityAgents: [],
            forcedCandidate: null,
            shards: {}
        };
        this._globalStopLock = null;
        this._globalStopFence = null;

        this.agentManager = new AgentManager(this);
        this.lockDirector = new LockDirector(this);
        this.policyManager = new PolicyManager(this);
        this.stateManager = new StateManager(this);
        this.treasury = new Treasury(this);
        this.sequencer = new ShardedSequencer();
        this.governanceEngine = new GovernanceEngine(this);
        this.logManager = new LogManager(this);
        this.settlementEngine = new SettlementEngine(this);
        this.isolationEngine = new IsolationPolicyEngine(this);
        this.ticketManager = new TicketManager(this);
        this.mineDirector = new MineDirector(this);

        this._setupEventListeners();
    }

    _composeResourceId(shardId, epoch) {
        return this.stateManager.composeResourceId(shardId, epoch);
    }

    _syncLegacyStateFromShard(shardId) {
        this.stateManager.syncLegacyStateFromShard(shardId);
    }

    getShardIds() {
        return this.stateManager.getShardIds();
    }

    getShardIdForAgent(uuid) {
        return this.stateManager.getShardIdForAgent(uuid);
    }

    getShardSnapshot(shardId) {
        return this.stateManager.getShardSnapshot(shardId);
    }

    async _monitorShards() {
        return this.stateManager.monitorShards();
    }

    async _bumpEpoch(shardId, reason, forcedCandidate = null) {
        return this.stateManager.bumpEpoch(shardId, reason, forcedCandidate);
    }

    _touchActivity(agentId) {
        this._lastActivityAt.set(String(agentId), Date.now());
    }

    async recordEvent(params) {
        return this.logManager.recordEvent(params);
    }

    async recordEconomicEvent(agent, params) {
        return this.logManager.recordEconomicEvent(agent, params);
    }

    async init(initialAgentCount = 0) {
        try {
            logger.info('🚀 [ATC-Service] Starting initialization...');
            await WalletEngine.init();
            await db.init();

            JobQueue.init(db.redis, db.mode === 'memory');
            JobQueue.registerQueue('audit-queue', async (job) => {
                try {
                    if (job.name.startsWith('econ:')) {
                        const { agentUuid, params } = job.data;
                        const agentObj = this.agents.get(agentUuid);
                        if (agentObj) {
                            await this.recordEconomicEvent(agentObj, params);
                        } else {
                            // Fallback if agent is no longer in memory
                            await this.recordEvent(params);
                        }
                    } else {
                        await this.recordEvent(job.data);
                    }
                } catch (err) {
                    logger.error(`[AuditQueue] Failed to process ${job.name}: ${err.message}`);
                    throw err;
                }
            });
            JobQueue.registerQueue('agent-status-queue', async (job) => {
                try {
                    const { agentId, statusData } = job.data;
                    const statusMap = await this.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
                    if (statusMap) {
                        await statusMap.put(agentId, statusData);
                    }
                } catch (err) {
                    logger.error(`[AgentStatusQueue] Failed to update status: ${err.message}`);
                    throw err;
                }
            });

            await hazelcastManager.init();
            this.sharedClient = hazelcastManager.getClient();
            await this.sequencer.init(this.sharedClient);
            await this.stateManager.initShards();
            
            if (initialAgentCount > 0) {
                await this.agentManager.updateAgentPool(initialAgentCount);
            }
            
            this.isReady = true;
            logger.info('✅ [ATC-Service] Successfully initialized.');
        } catch (err) {
            logger.error('❌ [ATC-Service] Initialization failed:', err);
        }
        
        // Ensure intervals are tracked to prevent open handles during tests
        if (this._stateEmitInterval) clearInterval(this._stateEmitInterval);
        
        this._stateEmitInterval = setInterval(() => {
            if (this.agents.size > 0) {
                this.emitState(); 
            }
        }, 100);
        if (this._stateEmitInterval.unref) {
            this._stateEmitInterval.unref();
        }
    }

    _setupEventListeners() {
        this.on('agent-acquired', this.handleAgentAcquired.bind(this));
        this.on('agent-released', this.handleAgentReleased.bind(this));
        this.on('agent-collision', this.handleAgentCollision.bind(this));
        this.on('agent-waiting', this.handleAgentWaiting.bind(this));
        this.on('priority-collision', this.handlePriorityCollision.bind(this));
    }

    addLog(agentId, message, type = 'info', meta = {}) {
        if (this.logManager) {
            return this.logManager.addLog(agentId, message, type, meta);
        }
    }

    clearAgentLogs(agentId) {
        if (this.logManager) {
            return this.logManager.clearAgentLogs(agentId);
        }
    }

    canAgentAcquire(uuid) { return this.policyManager.canAgentAcquire(uuid); }
    async togglePriority(uuid, enable) { return this.policyManager.togglePriority(uuid, enable); }
    async updatePriorityOrder(newOrder) { return this.policyManager.updatePriorityOrder(newOrder); }

    async ensureTicket(shardId, uuid, bidAmount) { return this.ticketManager.ensureTicket(shardId, uuid, bidAmount); }
    async cancelTicket(shardId, uuid) { return this.ticketManager.cancelTicket(shardId, uuid); }
    async completeTicketTurn(shardId, uuid) { return this.ticketManager.completeTicketTurn(shardId, uuid); }

    async updateAgentPool(count) { return this.agentManager.updateAgentPool(count); }
    async startSimulation(count = 2) { await this.updateAgentPool(count); }
    async renameAgent(uuid, newName) { return this.agentManager.renameAgent(uuid, newName); }
    async pauseAgent(uuid, pause) { return this.agentManager.pauseAgent(uuid, pause); }
    
    async terminateAgent(uuid) { 
        const result = await this.agentManager.terminateAgent(uuid);
        this.clearAgentLogs(uuid);
        this.state.activeAgentCount = this.agents.size;
        this.emitState();
        return result;
    }

    async transferLock(uuid) { return this.lockDirector.transferLock(uuid); }
    async humanOverride() { return this.lockDirector.humanOverride(); }
    async releaseHumanLock() { return this.lockDirector.releaseHumanLock(); }

    listIsolationTasks() {
        return this.isolationEngine.getPublicState();
    }

    finalizeTask(taskId, adminUuid) {
        return this.isolationEngine.finalize(taskId, adminUuid);
    }

    rollbackTask(taskId, adminUuid, reason) {
        return this.isolationEngine.rollback(taskId, adminUuid, reason);
    }

    cancelTask(taskId, adminUuid, reason) {
        return this.isolationEngine.cancel(taskId, adminUuid, reason);
    }

    retryTask(taskId, adminUuid) {
        return this.isolationEngine.retry(taskId, adminUuid);
    }

    registerAgentConfig(uuid, config) {
        logger.info(`📋 Registering config for ${uuid}: ${config.provider}/${config.model}`);
        this.agentConfigs.set(uuid, config);

        const agent = this.agents.get(uuid);
        if (agent) {
            agent.config = { ...agent.config, ...config };
            if (config.model) agent.model = config.model;
        }
        this.emitState();
    }

    async toggleGlobalStop(enable) {
        const next = Boolean(enable);

        if (this.sharedClient && typeof this.sharedClient.getCPSubsystem === 'function') {
            const cp = this.sharedClient.getCPSubsystem();
            const lock = await cp.getLock(CONSTANTS.GLOBAL_STOP_LOCK_NAME);
            if (next) {
                if (!this._globalStopFence) {
                    const fence = await lock.tryLock(250);
                    if (!fence) throw new Error('GLOBAL_STOP_LOCK_ACQUIRE_FAILED');
                    this._globalStopLock = lock;
                    this._globalStopFence = fence;
                }
            } else {
                if (this._globalStopLock && this._globalStopFence) {
                    await this._globalStopLock.unlock(this._globalStopFence).catch(() => {});
                }
                this._globalStopLock = null;
                this._globalStopFence = null;
            }
        }

        this.state.globalStop = next;
        if (next && this.stateManager?.bumpEpoch) {
            const shardIds = this.getShardIds();
            for (const shardId of shardIds) {
                await this.stateManager.bumpEpoch(shardId, 'GLOBAL_STOP', null);
            }
        }

        this.addLog('SYSTEM', `Global stop ${next ? 'Enabled' : 'Disabled'}`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
        this.emitState();
    }

    async isAgentPaused(uuid) {
        if (!this.sharedClient) return false;
        try {
            const map = await this.sharedClient.getMap(CONSTANTS.MAP_AGENT_COMMANDS);
            const cmd = await map.get(uuid);
            return cmd && cmd.cmd === CONSTANTS.CMD_PAUSE;
        } catch (e) { 
            return false; 
        }
    }

    stop() {
        if (this._stateEmitInterval) clearInterval(this._stateEmitInterval);
        if (this.agentManager) this.agentManager.stopAll();
    }

    async shutdown() {
        if (this._stateEmitInterval) clearInterval(this._stateEmitInterval);
        
        if (this.agentManager && typeof this.agentManager.stopAll === 'function') {
            await this.agentManager.stopAll().catch(e => logger.error('AgentManager stopAll error:', e));
        }
        
        if (this.isolationEngine && typeof this.isolationEngine.stop === 'function') {
            try { await this.isolationEngine.stop(); } catch (e) { logger.error('IsolationEngine stop error:', e); }
        }
        
        if (this.settlementEngine && typeof this.settlementEngine.stop === 'function') {
            try { this.settlementEngine.stop(); } catch (e) { logger.error('SettlementEngine stop error:', e); }
        }
        
        if (this.governanceEngine && typeof this.governanceEngine.stop === 'function') {
            try { this.governanceEngine.stop(); } catch (e) { logger.error('GovernanceEngine stop error:', e); }
        }
        
        if (this.ticketManager && typeof this.ticketManager.stop === 'function') {
            try { this.ticketManager.stop(); } catch (e) { logger.error('TicketManager stop error:', e); }
        }
        
        if (this.sharedClient && typeof this.sharedClient.shutdown === 'function') {
            try { await this.sharedClient.shutdown(); } catch (e) { logger.error('SharedClient shutdown error:', e); }
        }
    }

    getShardIdForAgent(uuid) {
        if (this.stateManager && this.stateManager.getShardIdForAgent) {
            return this.stateManager.getShardIdForAgent(uuid);
        }
        return 'RG-0';
    }

    async getAgentStatus() {
        if (!this.sharedClient) return [];
        try {
            const map = await this.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
            const entrySet = await map.entrySet();
            const statusList = [];
            const now = Date.now();
            const isolationTasks = (this.state.isolation?.tasks || []);
            const pendingByAgent = new Map();
            for (const t of isolationTasks) {
                const actor = String(t.actorUuid || '');
                if (!actor) continue;
                if (!pendingByAgent.has(actor)) pendingByAgent.set(actor, []);
                pendingByAgent.get(actor).push(t);
            }

            const settlementChannels = (this.state.settlement?.channels || []);
            const settlementByAgent = new Map();
            for (const ch of settlementChannels) {
                const channelId = String(ch.channelId || '');
                const parts = channelId.split(':');
                if (parts.length >= 2) settlementByAgent.set(parts[1], ch);
            }

            for (const [uuid, info] of entrySet) {
                if (this.agents.has(uuid) || (now - info.lastUpdated < 5000)) {
                    info.id = info.uuid; 

                    const agentObj = this.agents.get(uuid);
                    info.displayName = agentObj ? agentObj.id : (info.displayName || info.id);
                    
                    info.priority = (this.state.priorityAgents || []).includes(uuid);
                    info.isPaused = await this.isAgentPaused(uuid);
                    const iso = pendingByAgent.get(uuid) || [];
                    const hasPending = iso.some(t => String(t.status) === 'PENDING');
                    const settlement = settlementByAgent.get(uuid);
                    const lastStatus = String(settlement?.lastStatus || '');
                    const hasSnap = settlement && settlement.lastNonce !== undefined && settlement.lastNonce !== null;
                    let l4Phase = 'SANDBOX';
                    if (hasPending) l4Phase = 'SANDBOX';
                    else if (lastStatus === 'FINALIZED') l4Phase = 'FINALIZED';
                    else if (hasSnap) l4Phase = 'COMMIT';
                    info.l4Phase = l4Phase;
                    info.onchainStatus = lastStatus || null;
                    info.onchainTxid = settlement?.lastTxid || null;
                    statusList.push(info);
                }
            }
            return statusList.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', undefined, {numeric: true}));
        } catch (e) {
            if (process.env.NODE_ENV !== 'test') {
                logger.error('Failed to get agent status:', e.message);
            }
            return [];
        }
    }

    async commitAgentAcquired({ id, fence, latency, shardId, resourceId, epoch, ticket }) {
        const uuid = String(id);
        const sid = shardId || this.getShardIdForAgent(uuid);
        const shard = this.state.shards?.[sid];
        if (!shard) throw new Error('SHARD_NOT_FOUND');

        const shardEpoch = epoch ?? shard.epoch;
        const rid = resourceId || shard.resourceId;
        await this.recordEvent({
            shardId: sid,
            shardEpoch,
            resourceId: rid,
            fenceToken: fence,
            action: EVENT_TYPES.LOCK_ACQUIRED,
            actorUuid: uuid,
            payload: { latency, ticket: ticket || 0 }
        });

        if (shard.forcedCandidate?.uuid === uuid) {
            this.lockDirector.clearTransferTimeoutForCandidate(uuid);
            this.addLog(uuid, `✨ Success: Received Transferred Lock (${sid})`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
            this.emit('transfer-success', { id: uuid, shardId: sid });
            shard.forcedCandidate = null;
        } else if (this.state.forcedCandidate === uuid) {
            this.lockDirector.clearTransferTimeoutForCandidate(uuid);
            this.addLog(uuid, `✨ Success: Received Transferred Lock`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
            this.emit('transfer-success', { id: uuid });
            this.state.forcedCandidate = null;
        }

        if (this.takeoverEscrow?.has(uuid)) {
            const escrow = this.takeoverEscrow.get(uuid);
            const victim = this.agents.get(escrow.victim);
            if (victim) {
                victim.account.balance += escrow.amount;
                this.addLog('SYSTEM', `💸 Escrow paid to ${victim.id} (${escrow.amount} SOL)`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.EVICTION_SLASH });
            }
            this.takeoverEscrow.delete(uuid);
        }

        this.addLog(uuid, `🔒 Access Granted (Fence: ${fence})`, 'lock', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });

        shard.holder = uuid;
        shard.fencingToken = fence;
        shard.latency = latency;
        shard.lease = { startsAt: Date.now(), endsAt: Date.now() + (Number(CONSTANTS.LOCK_LEASE_MS) || 5000), durationMs: Number(CONSTANTS.LOCK_LEASE_MS) || 5000 };
        shard.waitingAgents = (shard.waitingAgents || []).filter(a => String(a) !== uuid);

        const primary = Object.keys(this.state.shards || {})[0] || 'RG-0';
        if (primary === sid) {
            this.state.holder = uuid;
            this.state.fencingToken = fence;
            this.state.latency = latency;
            this.state.timestamp = Date.now();
            this.state.waitingAgents = (this.state.waitingAgents || []).filter(uid => uid !== uuid);
        }
        this.emitState();
        return { ok: true };
    }

    handleAgentAcquired(payload) {
        this.commitAgentAcquired(payload).catch(err => {
            logger.error(`[ATCService] commitAgentAcquired failed for ${payload?.id}:`, err.message);
        });
    }

    async commitAgentReleased({ id, shardId, resourceId, epoch }) {
        const uuid = String(id);
        const sid = shardId || this.getShardIdForAgent(uuid);
        const shard = this.state.shards?.[sid];
        if (!shard) throw new Error('SHARD_NOT_FOUND');

        const shardEpoch = epoch ?? shard.epoch;
        const rid = resourceId || shard.resourceId;
        await this.recordEvent({
            shardId: sid,
            shardEpoch,
            resourceId: rid,
            action: EVENT_TYPES.LOCK_RELEASED,
            actorUuid: uuid,
        });

        this.addLog(uuid, `🔓 Lock Released on ${sid}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_RELEASED });

        if (shard.holder === uuid) {
            shard.holder = null;
            shard.fencingToken = null;
            shard.lease = null;
        }

        const primary = Object.keys(this.state.shards || {})[0] || 'RG-0';
        if (primary === sid && this.state.holder === uuid) {
            this.state.holder = null;
            this.state.fencingToken = null;
        }

        this.emitState();
        return { ok: true };
    }

    async handleAgentReleased(payload) {
        try {
            await this.commitAgentReleased(payload);
        } catch (err) {
            logger.error(`[ATCService] commitAgentReleased failed for ${payload?.id}:`, err.message);
        }
    }

    handleAgentCollision() {
        this.state.collisionCount++;
        this.addLog('NETWORK', `⚠️ Collision detected!`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
        this.emitState();
    }

    handlePriorityCollision() {
        this.state.collisionCount++;
        this.state.priorityCollisionTrigger = Date.now();
        this.addLog('POLICY', `🚨 Priority Contention`, 'policy', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
        this.emitState();
    }

    handleAgentWaiting({ id }) {
        const uuid = id;
        const currentHolder = this.state.holder;
        const pList = this.state.priorityAgents || [];

        if (currentHolder && currentHolder !== uuid) {
            const holderAgent = this.agents.get(currentHolder);
            const holderName = holderAgent ? holderAgent.id : (currentHolder === 'Human (Admin)' ? 'ADMIN' : currentHolder);

            if (pList.includes(currentHolder) && !pList.includes(uuid)) {
                this.addLog(uuid, `🚫 BLOCKED_BY: [${holderName}]`, 'policy', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_BLOCKED });
                this.handlePriorityCollision();
            } 
            else {
                if (!(this.state.waitingAgents || []).includes(uuid)) {
                   this.addLog(uuid, `⚔️ WAIT_FOR: [${holderName}]`, 'warn', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_WAIT });
                }
            }
        }

        if (!(this.state.waitingAgents || []).includes(uuid)) {
            this.addLog(uuid, `⏳ Waiting in queue...`, 'info', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_WAIT });
            if (!this.state.waitingAgents) this.state.waitingAgents = [];
            this.state.waitingAgents.push(uuid);
            this.emitState();
        }
    }

    emitState() {
        this.emit('state', { ...this.state });
    }
}

const key = '__LEX_ATC_ATC_INSTANCES__';
if (!globalThis[key]) globalThis[key] = new Set();
const inst = new ATCService();
globalThis[key].add(inst);
module.exports = inst;
