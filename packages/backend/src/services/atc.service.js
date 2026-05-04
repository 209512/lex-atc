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
const { toggleGlobalStop } = require('./atc.service.globalStop');
const { isAgentPaused, getAgentStatus } = require('./atc.service.agentStatus');
const { commitAgentAcquired, commitAgentReleased } = require('./atc.service.lock');
const { handleAgentWaiting, handleAgentCollision, handlePriorityCollision } = require('./atc.service.flow');

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
            if (this._stateEmitInterval) clearInterval(this._stateEmitInterval);
            this._stateEmitInterval = setInterval(() => {
                if (this.agents.size > 0) {
                    this.emitState();
                }
            }, 100);
            if (this._stateEmitInterval.unref) {
                this._stateEmitInterval.unref();
            }
        } catch (err) {
            this.isReady = false;
            if (this._stateEmitInterval) {
                clearInterval(this._stateEmitInterval);
                this._stateEmitInterval = null;
            }
            logger.error('❌ [ATC-Service] Initialization failed:', err);
            throw err;
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

    async updateAgentPool(count) {
        const target = Number(count);
        await this.agentManager.updateAgentPool(target);
        return { success: true, count: target, activeAgentCount: this.agents.size };
    }
    async startSimulation(count = 2) { await this.updateAgentPool(count); }
    async renameAgent(uuid, newName) { return this.agentManager.renameAgent(uuid, newName); }
    async pauseAgent(uuid, pause) {
        await this.agentManager.pauseAgent(uuid, pause);
        return { success: true, uuid: String(uuid), pause: Boolean(pause) };
    }
    
    async terminateAgent(uuid) { 
        const result = await this.agentManager.terminateAgent(uuid);
        this.clearAgentLogs(uuid);
        this.state.activeAgentCount = this.agents.size;
        this.emitState();
        return { success: Boolean(result), uuid: String(uuid) };
    }

    async transferLock(uuid) { return this.lockDirector.transferLock(uuid); }
    async humanOverride() { return this.lockDirector.humanOverride(); }
    async releaseHumanLock() { return this.lockDirector.releaseHumanLock(); }

    listIsolationTasks() {
        return this.isolationEngine.getPublicState();
    }

    finalizeTask(taskId, adminUuid, ctx) {
        return this.isolationEngine.finalize(taskId, adminUuid, ctx);
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
        return { success: true, uuid: String(uuid) };
    }

    async toggleGlobalStop(enable) {
        return toggleGlobalStop(this, enable);
    }

    async isAgentPaused(uuid) {
        return isAgentPaused(this, uuid);
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

    async getAgentStatus({ includePosition = false } = {}) {
        return getAgentStatus(this, { includePosition });
    }

    async commitAgentAcquired({ id, fence, latency, shardId, resourceId, epoch, ticket }) {
        return commitAgentAcquired(this, { id, fence, latency, shardId, resourceId, epoch, ticket });
    }

    handleAgentAcquired(payload) {
        this.commitAgentAcquired(payload).catch(err => {
            logger.error(`[ATCService] commitAgentAcquired failed for ${payload?.id}:`, err.message);
        });
    }

    async commitAgentReleased({ id, shardId, resourceId, epoch }) {
        return commitAgentReleased(this, { id, shardId, resourceId, epoch });
    }

    async handleAgentReleased(payload) {
        try {
            await this.commitAgentReleased(payload);
        } catch (err) {
            logger.error(`[ATCService] commitAgentReleased failed for ${payload?.id}:`, err.message);
        }
    }

    handleAgentCollision() {
        return handleAgentCollision(this);
    }

    handlePriorityCollision() {
        return handlePriorityCollision(this);
    }

    handleAgentWaiting({ id }) {
        return handleAgentWaiting(this, { id });
    }

    emitState() {
        this.emit('state', { ...this.state });
    }
}

module.exports = new ATCService();
