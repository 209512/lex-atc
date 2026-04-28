// backend/src/core/Agent.js
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const tracer = require('../utils/apm');
const crypto = require('crypto');
const hazelcastManager = require('./HazelcastManager');
const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');
const ProviderFactory = require('./providers/ProviderFactory');
const JobQueue = require('./queue/JobQueue');
const PhysicsEngine = require('./PhysicsEngine');
const WalletEngine = require('./WalletEngine');
const db = require('./DatabaseManager');
const ReputationEngine = require('./ReputationEngine');
const { LEX_CONSTITUTION, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const path = require('path');
const Piscina = require('piscina');

const AGENT_UUID_NAMESPACE = '8d7f7f92-6bd9-4d7e-a46b-2bdb0e5b2f6d';

const createAgentUuid = (id) => uuidv5(`lex-atc:${String(id)}`, AGENT_UUID_NAMESPACE);

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

class Agent {  
  constructor(id, eventBus, config = {}, sharedClient = null) {  
    this.id = id;
    this.uuid = createAgentUuid(id);
    
    this.eventBus = eventBus; 
    this.config = config; 
    this.client = sharedClient || hazelcastManager.getClient();
    this.isRunning = false;  
    this.provider = null;
    this.currentLock = null;
    this.currentFence = null;
    this.currentShardId = null;
    this.currentTicket = null;
    this.currentContext = null;
    this.errorCount = 0;
    this.timers = new Set();
    this._globalStopLockHeldUntil = 0;
    this._globalStopLockCheckAt = 0;

    const idMatch = id.match(/\d+/);
    this.seed = idMatch ? parseInt(idMatch[0]) : Math.floor(Math.random() * 1000);

    this.startTime = Date.now(); 
    this.pausedDuration = 0;
    this.pauseStartedAt = null;

    const derived = WalletEngine.getAgentKeypair(this.uuid);
    const wallet = derived ? {
        address: derived.publicKey.toBase58(),
        secretKey: null,
        createdAt: Date.now()
      } : WalletEngine.generateSovereignWallet();
    this.account = WalletEngine.getInitialAccount(wallet);
    this.address = wallet.address;
    
    this.account.difficulty = (LEX_CONSTITUTION.MINING && LEX_CONSTITUTION.MINING.BASE_DIFFICULTY) || 4;

    this.stats = {
        successCount: 0,
        totalTasks: 0,
        avgAiLatency: 2000
    };

    this.state = {
        status: CONSTANTS.STATUS_IDLE,
        resource: CONSTANTS.RESOURCE_NONE,
        activity: 'INITIALIZING'
    };
    
    this._abortController = null;

    this.currentShardId = (config && config.shardId) ? String(config.shardId) : (this.eventBus.getShardIdForAgent ? this.eventBus.getShardIdForAgent(this.uuid) : null);
  }

  _delay(ms) {
      return new Promise(resolve => {
          const t = setTimeout(() => {
              this.timers.delete(t);
              resolve();
          }, ms);
          this.timers.add(t);
      });
  }

  async restoreState() {
    try {
        const saved = await db.loadAgentState(this.uuid);
        if (saved) {
            this.account.balance = saved.balance;
            this.account.reputation = saved.reputation;
            this.account.totalEarned = saved.total_earned;
            this.stats.successCount = saved.success_count;
            this.stats.totalTasks = saved.total_tasks;
            this.stats.avgAiLatency = saved.avg_latency || 2000;
            this.log(`📜 State Restored: ${this.account.balance.toFixed(4)} SOL / Rep: ${this.account.reputation.toFixed(1)}`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.SPAWN_AGENT });
        }
    } catch (e) {
        this.log(`⚠️ Restore failed: ${e.message}`, 'warn');
    }
  }

  log(msg, type = 'info', meta = {}) {
      const sanitizedMsg = msg.replace(/([1-9A-HJ-NP-Za-km-z]{32,44})/g, (addr) => 
          `${addr.slice(0, 4)}...${addr.slice(-4)}`
      );
      if (this.eventBus && typeof this.eventBus.addLog === 'function') {
          this.eventBus.addLog(this.uuid, sanitizedMsg, type, meta);
      }
  }
  
  _decideBidStrategy(shard) {
    const minBid = 0.001;
    const maxSafeBid = this.account.balance * 0.1;
    
    let bid = minBid + (this.account.reputation / 1000);
    
    if (this.currentTicket && shard.servingTicket) {
        const waitCount = this.currentTicket - shard.servingTicket;
        if (waitCount > 3) bid *= 1.5;
    }

    return Math.min(bid, maxSafeBid);
  }

  async start() {  
    if (this.isRunning) return;  
    this.isRunning = true;  

    try {  
      this.provider = ProviderFactory.create(this.config.provider || 'mock', this.config);
      await this.provider.init().catch(e => logger.warn(`[${this.id}] Provider init: ${e.message}`));
      await this.restoreState();

      if (!this.client) {
          await hazelcastManager.init();
          this.client = hazelcastManager.getClient();
      }

      this.statusMap = await this.client.getMap(CONSTANTS.MAP_AGENT_STATUS);
      this.commandsMap = await this.client.getMap(CONSTANTS.MAP_AGENT_COMMANDS);

      this.log(`Agent Online [V3]: ${this.id} (Wallet: ${this.account.address})`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.SPAWN_AGENT });

      this.startTime = Date.now();
      await this.updateStatus(CONSTANTS.STATUS_IDLE, CONSTANTS.RESOURCE_NONE, "READY");

      this.posUpdateTimer = setInterval(() => {
          if (this.isRunning) {
              this.updateStatus(this.state.status, this.state.resource, this.state.activity);
          }
      }, 50);
      if (this.posUpdateTimer.unref) this.posUpdateTimer.unref();

      this.loop();  
    } catch (err) {  
      logger.error(`❌ Agent ${this.id} (${this.uuid}) failed to start:`, err);  
      this.isRunning = false;  
    }  
  }  
  
  async loop() {   
      if (!this.client) return;
      const cpSubsystem = this.client.getCPSubsystem();
    
      while (this.isRunning) {   
        try {
          if (!this.isRunning) break;

          const command = await this.commandsMap.get(this.uuid);
          const isPausedCmd = command && command.cmd === CONSTANTS.CMD_PAUSE;
          const isGlobalStopped = !!this.eventBus.state.globalStop;
          const now = Date.now();
          if (!isGlobalStopped && now >= this._globalStopLockCheckAt) {
              this._globalStopLockCheckAt = now + 500;
              try {
                  const gl = await cpSubsystem.getLock(CONSTANTS.GLOBAL_STOP_LOCK_NAME);
                  const fence = await gl.tryLock(1);
                  if (fence) {
                      await gl.unlock(fence).catch(err => logger.error(`[Agent ${this.uuid}] global stop unlock error:`, err));
                      this._globalStopLockHeldUntil = 0;
                  } else {
                      this._globalStopLockHeldUntil = now + 750;
                  }
              } catch {}
          }
          const isGlobalLockHeld = this._globalStopLockHeldUntil > now;

          if (isPausedCmd || isGlobalStopped || isGlobalLockHeld) {
              if (!this.pauseStartedAt) this.pauseStartedAt = Date.now();
              await this.updateStatus(CONSTANTS.STATUS_PAUSED, CONSTANTS.RESOURCE_NONE, (isGlobalStopped || isGlobalLockHeld) ? "GLOBAL_HALT" : "SUSPENDED");
              
              if (this.currentLock && this.currentFence) {
                  try { 
                      await this.currentLock.unlock(this.currentFence); 
                  } catch (e) {
                      logger.error(`[Agent ${this.uuid}] Failed to unlock during pause:`, e.message);
                  }
                  this.currentLock = null; this.currentFence = null;
                  this.emitReleased(this.uuid);
              }
              if (this.currentTicket && this.currentShardId) {
                  await this.eventBus.cancelTicket(this.currentShardId, this.uuid).catch(err => logger.error(`[Agent ${this.uuid}] cancelTicket error during pause:`, err));
                  this.currentTicket = null;
              }
              await this._delay(CONSTANTS.AGENT_PAUSE_DELAY || 200); 
              continue; 
          }

          if (this.pauseStartedAt) {
              this.pausedDuration += (Date.now() - this.pauseStartedAt);
              this.pauseStartedAt = null;
          }

          if (this.account.escrow < LEX_CONSTITUTION.ECONOMY.MIN_ESCROW) {
              this.log(`⚠️ INSUFFICIENT_ESCROW: ${this.account.escrow} SOL`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.MINE_REWARD });
              await this.updateStatus('ERROR', CONSTANTS.RESOURCE_NONE, "INSUFFICIENT_ESCROW");
              await this._delay(CONSTANTS.AGENT_ESCROW_DELAY || 2000);
              continue;
          }

          const shardId = this.currentShardId || (this.eventBus.getShardIdForAgent ? this.eventBus.getShardIdForAgent(this.uuid) : null);
          const shard = shardId ? this.eventBus.getShardSnapshot(shardId) : null;
          if (!shard) { await this._delay(CONSTANTS.AGENT_NO_SHARD_DELAY || 200); continue; }

          if (shard.holder && shard.holder !== this.uuid) {
              const timeOccupied = Date.now() - (shard.acquiredAt || Date.now());
              const takeoverCost = LEX_CONSTITUTION.ECONOMY.TAKEOVER_BASE_COST || 0.5;

              if (timeOccupied > 15000 && this.account.balance > takeoverCost * 1.5) {
                  this.log(`🔥 Initiating Hostile Takeover against ${shard.holder}...`, 'critical', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
                  const success = await this.eventBus.lockDirector.executeHostileTakeover(this.uuid, shard.holder, takeoverCost);
                  if (success) {
                      await this._delay(CONSTANTS.AGENT_TAKEOVER_DELAY || 100);
                      continue; 
                  }
              }
          }

          const forced = shard.forcedCandidate;
          const isTarget = !!forced?.uuid && String(forced.uuid) === String(this.uuid) && Number(forced.epoch) === Number(shard.epoch);
          const canAcquire = await this.eventBus.canAgentAcquire(this.uuid, shardId);
          
          if (!isTarget && !canAcquire) {
              await this.updateStatus(CONSTANTS.STATUS_WAITING, CONSTANTS.RESOURCE_NONE, "WAITING");
              await this._delay(CONSTANTS.AGENT_WAITING_DELAY || 200);
              continue;
          }

          if (!isTarget) {
              const myBid = this._decideBidStrategy(shard);
              const ticketInfo = await this.eventBus.ensureTicket(shardId, this.uuid, myBid);
              this.currentTicket = ticketInfo.ticket;

              // Check if we are priority or highest bidder to bypass strict FIFO queue
              const isPriority = (this.eventBus.state.priorityAgents || []).includes(this.uuid);
              const highestBidderEntry = await this.eventBus.sequencer.getHighestBidder(shardId);
              const isHighestBidder = highestBidderEntry && String(highestBidderEntry[1].uuid) === String(this.uuid);
              
              const serving = await this.eventBus.sequencer.getServingTicket(shardId);
              if (this.currentTicket !== serving && !isPriority && !isHighestBidder) {
                  await this.updateStatus(CONSTANTS.STATUS_WAITING, CONSTANTS.RESOURCE_NONE, `QUEUE_T${this.currentTicket}_B${myBid.toFixed(3)}`);
                  await this._delay(CONSTANTS.AGENT_QUEUE_DELAY || 100);
                  continue;
              }
          }

          const isPriority = (this.eventBus.state.priorityAgents || []).includes(this.uuid);
          const currentDifficulty = isPriority ? 1 : this.account.difficulty;
          
          await this.updateStatus('MINING', CONSTANTS.RESOURCE_NONE, `MINING_D${currentDifficulty}`);
          const challengeData = this.eventBus.mineDirector.generateChallenge(this.uuid, currentDifficulty);
          const proof = await tracer.trace('agent.solveChallenge', { resource: this.uuid }, async () => {
              return await this._solveChallenge(challengeData);
          });

          if (!this.eventBus.mineDirector.verifyProof(this.uuid, proof.nonce, proof.solution).isValid) continue;

          // Double check priority/policy before grabbing the lock, in case policy changed while mining
          const canAcquireNow = await this.eventBus.canAgentAcquire(this.uuid, shardId);
          if (!isTarget && !canAcquireNow) {
              await this.updateStatus(CONSTANTS.STATUS_WAITING, CONSTANTS.RESOURCE_NONE, "WAITING (POLICY CHANGED)");
              continue;
          }

          const currentResourceId = shard.resourceId;
          const lock = await cpSubsystem.getLock(currentResourceId);
          const acquiredFence = await tracer.trace('agent.tryLock', { resource: currentResourceId }, async () => {
              return await lock.tryLock(isTarget ? CONSTANTS.LOCK_TRY_WAIT_TARGET : CONSTANTS.LOCK_TRY_WAIT_NORMAL);   
          });
            
          if (acquiredFence) {
              this.currentLock = lock;
              this.currentFence = acquiredFence;
              this.currentContext = { shardId, shardEpoch: shard.epoch, resourceId: currentResourceId, fenceToken: acquiredFence.toString(), ticket: this.currentTicket };

              if (!this.eventBus.treasury.collectEntryFee(this, this.currentContext)) {
                  try { 
                      await lock.unlock(this.currentFence); 
                  } catch (e) {
                      logger.error(`[Agent ${this.uuid}] Failed to unlock after entry fee rejection:`, e.message);
                  }
                  this.currentLock = null; this.currentContext = null;
                  continue;
              }

              await this.updateStatus(CONSTANTS.STATUS_ACTIVE, currentResourceId, `EXECUTING_${shardId}`);
              try {
                  await this.emitAcquired(this.uuid, acquiredFence.toString(), 0, { shardId, resourceId: currentResourceId, epoch: shard.epoch, ticket: this.currentTicket });
              } catch (e) {
                  try {
                      await lock.unlock(this.currentFence);
                  } catch {}
                  this.currentLock = null; this.currentFence = null;
                  this.currentTicket = null;
                  this.currentContext = null;
                  await this.updateStatus(CONSTANTS.STATUS_IDLE, CONSTANTS.RESOURCE_NONE, "IDLE");
                  continue;
              }

              await this.executeTask(isTarget);

              this.eventBus.treasury.distributeReward(this, this.currentContext);
              
              try { 
                  await lock.unlock(this.currentFence); 
              } catch (e) {
                  logger.error(`[Agent ${this.uuid}] Failed to unlock after task execution:`, e.message);
              }
              this.currentLock = null; this.currentFence = null;
              try {
                  await this.emitReleased(this.uuid, { shardId, resourceId: currentResourceId, epoch: shard.epoch, ticket: this.currentTicket });
              } catch {}

              if (!isTarget && this.currentTicket !== null) {
                  await this.eventBus.completeTicketTurn(shardId, this.uuid).catch(err => {
                      logger.error(`[Agent ${this.uuid}] Failed to complete ticket turn:`, err.message);
                  });
              }
              this.currentTicket = null;
              this.currentContext = null;
              await this.updateStatus(CONSTANTS.STATUS_IDLE, CONSTANTS.RESOURCE_NONE, "IDLE");
          }
        } catch (err) {
            await this.handleError(err);
        }   
      }   
  }

  async _solveChallenge({ challenge, difficulty }) {
      if (this._abortController) this._abortController.abort();
      this._abortController = new AbortController();
      
      try {
          return await getMiningWorkerPool().run(
              { challenge, difficulty, yieldStep: CONSTANTS.MINING_YIELD_STEP || 1000 },
              { signal: this._abortController.signal }
          );
      } catch (err) {
          if (err.name === 'AbortError') {
              throw new Error('MINING_ABORTED');
          }
          throw err;
      }
  }

  async updateStatus(status, resource, activity) {
      if (this.statusMap && this.isRunning) {
          try {
              const now = Date.now();
            this.state.status = status || this.state.status;
            this.state.resource = resource || this.state.resource;
            this.state.activity = activity || this.state.activity;

            const isGloballyStopped = this.eventBus && this.eventBus.state && this.eventBus.state.globalStop;
            const isIndividuallyPaused = this.state.status === CONSTANTS.STATUS_PAUSED;
            
            if ((isGloballyStopped || isIndividuallyPaused) && !this.pauseStartedAt) {
                this.pauseStartedAt = now;
            }

            let totalPauseTime = this.pausedDuration;
            if (this.pauseStartedAt) totalPauseTime += (now - this.pauseStartedAt);

            const activeTime = (now - this.startTime) - totalPauseTime;
            const position = PhysicsEngine.getOrbitPosition(this.uuid, this.seed, activeTime);
            this.lastKnownPosition = position;

              const statusData = {
                  uuid: this.uuid,
                  id: this.id,
                  displayName: this.id,
                  displayId: this.id,
                  status: this.state.status,
                  resource: this.state.resource,
                  activity: this.state.activity,
                  account: this.account,
                  model: this.config.model || 'Mock',
                  position: position, 
                  lastUpdated: now,
                  priority: (this.eventBus.state.priorityAgents || []).includes(this.uuid),
                  shardId: this.currentShardId,
                  ticket: this.currentTicket
              };
              
              JobQueue.add('agent-status-queue', `status:${this.uuid}`, {
                  agentId: this.uuid,
                  statusData
              });
          } catch (e) {
              if (this.isRunning) logger.error(`[${this.id}] Status Update Failed:`, e.message);
          }
      }
  }
  
  async handleError(err) {
        this.errorCount++;
        this.stats.totalTasks++;
        this.account.reputation = ReputationEngine.calculate(this.account, this.stats);
        this.log(`⚠️ Runtime Error (${this.errorCount}): ${err.message}`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
        await this.updateStatus('ERROR', CONSTANTS.RESOURCE_NONE, `FAULT_${err.message}`);
        
        if (this.currentLock && this.currentFence) {
            try { 
                await this.currentLock.unlock(this.currentFence); 
            } catch (e) {
                logger.error(`[Agent ${this.uuid}] Failed to unlock during error handling:`, e.message);
            }
            this.currentLock = null; this.currentFence = null;
        }
        await this._delay(CONSTANTS.AGENT_ERROR_DELAY || 1000);
    }

  async executeTask(isTarget) {
      const startTime = Date.now();
      this.stats.totalTasks++; 
      await this.updateStatus(CONSTANTS.STATUS_ACTIVE, this.eventBus.state.resourceId, "AI_THINKING");

      const systemInstruction = this.config.systemPrompt || `You are a tactical ATC Agent [${this.id}].`;
      const prompt = isTarget ? "EMERGENCY OVERRIDE: Plan?" : "Describe task in 15 words.";

      try {
          this.log(`🧠 AI Processing (${this.config.provider || 'mock'})...`, 'info', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
          
          let timeoutId;
          const abortController = new AbortController();
          const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                  abortController.abort();
                  reject(new Error('AI_TIMEOUT'));
              }, CONSTANTS.AGENT_AI_TIMEOUT || 12000);
          });
          const aiResponse = await Promise.race([
              this.provider.generateResponse(prompt, systemInstruction, abortController.signal),
              timeoutPromise
          ]);
          clearTimeout(timeoutId);

          if (!aiResponse || aiResponse.length < 5) throw new Error('EMPTY_PAYLOAD');

          if (this.eventBus?.isolationEngine && this.currentContext) {
              const shardId = this.currentContext.shardId;
              const shardEpoch = this.currentContext.shardEpoch;
              const resourceId = this.currentContext.resourceId;
              const fenceToken = this.currentContext.fenceToken;
              
              // Double Check Middleware: Verify Fencing Token before calling external execution
              if (this.eventBus.lockDirector && typeof this.eventBus.lockDirector.verifyFencingToken === 'function') {
                  if (!this.eventBus.lockDirector.verifyFencingToken(shardId, fenceToken)) {
                      throw new Error('FENCING_TOKEN_VIOLATION');
                  }
              }

              const ctx = {
                  classification: this.config.isolationClass || null
              };

              const res = await this.eventBus.isolationEngine.createIntent({
                  actorUuid: this.uuid,
                  shardId,
                  shardEpoch,
                  resourceId,
                  fenceToken,
                  text: aiResponse,
                  context: ctx
              });

              if (res.status === 'PENDING') {
                  this.log(`⏳ Deferred Task: ${res.taskId}`, 'policy', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.ISOLATION, actionKey: LOG_ACTIONS.TASK_FINALIZE });
              } else {
                  this.log(`✅ Task Executed: ${res.taskId}`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ISOLATION, actionKey: LOG_ACTIONS.TASK_FINALIZE });
              }
          }

          const elapsed = Date.now() - startTime;
          this.stats.successCount++;
          this.stats.avgAiLatency = (this.stats.avgAiLatency * 0.8) + (elapsed * 0.2);

          this.account.reputation = ReputationEngine.calculate(this.account, this.stats);
          this.account.lastWorkHash = `0x${uuidv4().replace(/-/g, '').slice(0, 16)}`;
          
          this.log(`📝 [Result]: ${aiResponse}`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
          await this.updateStatus(null, null, "TASK_COMPLETED");
          
          const minTime = CONSTANTS.AGENT_MIN_TASK_TIME || 1500;
          if (elapsed < minTime) {
              await this._delay(minTime - elapsed);
          }

      } catch (err) {
          const reason = err.message;
          this.log(`❌ AI Execution Error: ${reason}`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
          if (this.eventBus.treasury) this.eventBus.treasury.applySlashing(this, reason, this.currentContext);
          
          this.account.reputation = ReputationEngine.calculate(this.account, this.stats);
          await this.updateStatus(null, null, "SLASHED");
          await this._delay(CONSTANTS.AGENT_SLASHED_DELAY || 2000);
      }

      if (isTarget) {
          this.eventBus.emitState();
      }
  }

  async stop() {  
    this.isRunning = false;  
    if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
    }
    if (this.posUpdateTimer) {
        clearInterval(this.posUpdateTimer);
        this.posUpdateTimer = null;
    }
    for (const t of this.timers) {
        clearTimeout(t);
    }
    this.timers.clear();
    try {
        if (this.currentTicket !== null && this.currentShardId) {
            await this.eventBus.cancelTicket(this.currentShardId, this.uuid).catch(err => {
                logger.error(`[Agent ${this.uuid}] cancelTicket error on stop:`, err.message);
            });
            this.currentTicket = null;
        }
        if (db) await db.saveAgentState(this);
        if (this.statusMap) await this.statusMap.remove(this.uuid);
        if (this.currentLock && this.currentFence) {
            await this.currentLock.unlock(this.currentFence).catch(err => {
                logger.error(`[Agent ${this.uuid}] unlock error on stop:`, err.message);
            });
        }
    } catch (e) {
        logger.error(`[Agent ${this.uuid}] Unexpected error during stop cleanup:`, e.message);
    }
    this.log(`🔴 Agent Offline: ${this.id}`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
  }  

  emitAcquired(holderUuid, token, latency, meta = {}) { 
      return this.eventBus.commitAgentAcquired({ id: holderUuid, fence: token, latency, ...meta });
  }  
  emitReleased(holderUuid, meta = {}) { 
      return this.eventBus.commitAgentReleased({ id: holderUuid, ...meta });
  }  

  static async destroyPool() {
      if (miningWorkerPool) {
        try { await miningWorkerPool.destroy(); } catch (e) {
            const logger = require('../utils/logger');
            logger.debug(`[Agent] Worker pool destroy error: ${e.message}`);
        }
        miningWorkerPool = null;
    }
  }
}  
  
module.exports = Agent;
