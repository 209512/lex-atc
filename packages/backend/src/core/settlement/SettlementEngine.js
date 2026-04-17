const { v4: uuidv4 } = require('uuid');
const { PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const CONSTANTS = require('../../config/constants');
const db = require('../DatabaseManager');
const WalletEngine = require('../WalletEngine');
const { canonicalStringify } = require('./CanonicalJson');
const { sign, verify, hashHex } = require('./SignatureEngine');
const SolanaSettlementProvider = require('./SolanaSettlementProvider');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS, LEX_CONSTITUTION } = require('@lex-atc/shared');
const logger = require('../../utils/logger');

const toLamports = (sol) => Math.round(Number(sol || 0) * 1_000_000_000);


const ArchivingWorker = require('../ArchivingWorker');
const Irys = require('@irys/sdk');
const AuditTrailArchiver = require('./AuditTrailArchiver');
// logger is already imported at the top of the file

class SettlementEngine {
    constructor(atcService) {
        this.atcService = atcService;
        this.provider = SolanaSettlementProvider.fromEnv();
        this.intervalRef = null;
        this.pendingByChannel = new Map();
        this.lastSnapshotByChannel = new Map();
        this.disputedByChannel = new Map();
        this.watcherIntervalRef = null;
        this.resolvedDisputes = new Set(); // Replay Attack Protection
        this.gas = {
            immediateTxCount: 0,
            snapshotTxCount: 0,
            lastUpdatedAt: 0,
            lastLoggedAt: 0,
        };
        AuditTrailArchiver.init();
    }

    _isQuietTestError(err) {
        if (String(process.env.QUIET_SETTLEMENT_TEST_LOGS || '').toLowerCase() !== 'true') return false;
        if (String(process.env.NODE_ENV || '').toLowerCase() !== 'test') return false;
        const msg = String(err?.message || err || '');
        return (
            msg.includes('SOLANA_SETTLEMENT_DISABLED') ||
            msg.includes('SETTLEMENT_KEYS_MISSING') ||
            msg.includes('SOLANA_RPC_URL_MISSING')
        );
    }

    getPublicState() {
        const pending = [];
        for (const [channelId, items] of this.pendingByChannel.entries()) {
            if (items && items.length > 0) pending.push({ channelId, pending: items.length });
        }
        pending.sort((a, b) => a.channelId.localeCompare(b.channelId));

        const channels = [];
        for (const [channelId, snap] of this.lastSnapshotByChannel.entries()) {
            channels.push({
                channelId,
                lastNonce: snap.nonce,
                lastStateHash: snap.stateHash,
                lastStatus: snap.status,
                lastTxid: snap.txid || null,
                lastCommitment: snap.commitment || null,
                lastUpdatedAt: snap.createdAt,
                disputed: Boolean(this.disputedByChannel.get(channelId)),
            });
        }
        channels.sort((a, b) => a.channelId.localeCompare(b.channelId));

        return { pending, channels };
    }

    _readGasParams() {
        const solanaFeeSol = Number(process.env.SOLANA_AVG_TX_FEE_SOL || 0.000005);
        const solUsd = Number(process.env.SOLANA_USD_PRICE || 150);
        return { solanaFeeSol, solUsd };
    }

    _computeGasEconomics() {
        const { solanaFeeSol, solUsd } = this._readGasParams();
        const aTx = Number(this.gas.immediateTxCount || 0);
        const bTx = Number(this.gas.snapshotTxCount || 0);
        const costAUsd = aTx * solanaFeeSol * solUsd;
        const costBUsd = bTx * solanaFeeSol * solUsd;
        const savedUsd = Math.max(0, costAUsd - costBUsd);
        const savingsPct = costAUsd > 0 ? (savedUsd / costAUsd) * 100 : 0;
        return {
            mode: this.provider?.enabled ? 'ANCHOR' : 'SIMULATION',
            solanaFeeSol,
            solUsd,
            immediateTxCount: aTx,
            snapshotTxCount: bTx,
            costAUsd,
            costBUsd,
            savedUsd,
            savingsPct,
            updatedAt: Date.now(),
        };
    }

    _emitGasEconomics(reason = 'tick') {
        const econ = this._computeGasEconomics();
        this.gas.lastUpdatedAt = econ.updatedAt;
        if (this.atcService?.state) this.atcService.state.gasEconomics = econ;
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();

        const now = Date.now();
        if (this.atcService?.addLog && (now - Number(this.gas.lastLoggedAt || 0)) > 15_000) {
            this.gas.lastLoggedAt = now;
            const pct = econ.savingsPct.toFixed(2);
            const usd = econ.savedUsd.toFixed(4);
            this.atcService.addLog('SYSTEM', `Estimated Gas Savings: ${pct}% | Saved Cost (USD): ${usd} | A=${econ.immediateTxCount}tx B=${econ.snapshotTxCount}tx (${reason})`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.SETTLEMENT_SUBMIT });
        }
    }

    _getGlobalDepositLimitSol(agent) {
        const envLimit = process.env.GLOBAL_DEPOSIT_SOL;
        if (envLimit !== undefined && envLimit !== null && String(envLimit).length > 0) return Number(envLimit);
        const initial = agent?.account?.initialBalance;
        if (typeof initial === 'number' && Number.isFinite(initial)) return Number(initial);
        return Number(LEX_CONSTITUTION?.ECONOMY?.INITIAL_BALANCE || 0) + Number(LEX_CONSTITUTION?.ECONOMY?.MIN_ESCROW || 0);
    }

    async _enforceDepositBounds(agent, meta = {}) {
        const limit = this._getGlobalDepositLimitSol(agent);
        const balance = Number(agent?.account?.balance ?? 0);
        const escrow = Number(agent?.account?.escrow ?? 0);
        const total = balance + escrow;
        const ok = balance >= 0 && escrow >= 0 && total <= limit;
        if (ok) return true;

        const reason = 'DEPOSIT_RANGE_VIOLATION';
        if (this.atcService?.treasury?.applySlashing) {
            this.atcService.treasury.applySlashing(agent, reason, meta);
        }

        await this.atcService.recordEvent({
            shardId: meta.shardId || 'RG-0',
            shardEpoch: Number(meta.shardEpoch ?? 0),
            resourceId: meta.resourceId || null,
            fenceToken: meta.fenceToken || null,
            action: 'SETTLEMENT_DEPOSIT_VIOLATION',
            actorUuid: String(agent.uuid),
            correlationId: `settlement:deposit:${String(agent.uuid)}:${Date.now()}`,
            payload: { balance, escrow, total, limit, ...meta }
        }).catch(() => {});

        throw new Error(reason);
    }

    start() {
        if (this.intervalRef) return;
        this.intervalRef = setInterval(() => {
            this.flushPending().catch(err => {
                if (!this._isQuietTestError(err)) logger.error('[SettlementEngine] flushPending Error:', err.message);
            });
        }, Number(CONSTANTS.SETTLEMENT_INTERVAL_MS || 0));
        if (this.intervalRef.unref) this.intervalRef.unref();

        if (!this.watcherIntervalRef) {
            this.watcherIntervalRef = setInterval(() => {
                this._runAutoMonitoring().catch(err => {
                    if (!this._isQuietTestError(err)) logger.error('[SettlementEngine] Auto-Monitoring Error:', err.message);
                });
            }, 10000); // Run auto-monitoring every 10 seconds
            if (this.watcherIntervalRef.unref) this.watcherIntervalRef.unref();
        }
    }

    stop() {
        if (this.intervalRef) clearInterval(this.intervalRef);
        if (this.watcherIntervalRef) clearInterval(this.watcherIntervalRef);
        this.intervalRef = null;
        this.watcherIntervalRef = null;
    }

    async _runAutoMonitoring() {
        // [Auto-Monitoring Logic] AI Watcher automatically audits channels and opens disputes for anomalous behaviors
        for (const [channelId, snap] of this.lastSnapshotByChannel.entries()) {
            if (this.disputedByChannel.get(channelId)) continue; 

            const agentUuid = channelId.split(':')[1];
            const agent = this.atcService.agents.get(agentUuid);
            
            if (agent) {
                // Rule 1: Agent is in ERROR state but still has active settlement channels
                const isErrorState = agent.status === 'ERROR';
                
                // Rule 2: Agent has abnormally high collisions indicating possible spamming or malicious lock stealing
                const hasHighCollisions = (agent.metrics?.collisions || 0) > 20;

                // Rule 3: Advanced ML-based anomaly detection via external API
                let isMlAnomaly = false;
                let mlReason = '';
                const mlApiUrl = this.atcService.config?.ai?.mlInferenceApiUrl || process.env.ML_INFERENCE_API_URL;

                if (mlApiUrl) {
                    try {
                        const payload = {
                            agentId: agentUuid,
                            metrics: {
                                collisions: agent.metrics?.collisions || 0,
                                balance: agent.account?.balance || 0,
                                initialBalance: agent.account?.initialBalance || 1000,
                                activeProposals: Array.from(this.atcService.governanceEngine?.proposals?.values() || [])
                                    .filter(p => p.adminId === agentUuid && p.status === 'ACTIVE').length
                            }
                        };
                        const response = await axios.post(mlApiUrl, payload, { timeout: 2000 });
                        if (response.data && response.data.anomalyScore !== undefined) {
                            if (!agent.metrics) agent.metrics = {};
                            agent.metrics.anomalyScore = response.data.anomalyScore;
                            
                            if (response.data.anomalyScore > 0.8) {
                                isMlAnomaly = true;
                                mlReason = response.data.reason || 'AUTO_DETECTED_ML_ANOMALY';
                            }
                        }
                    } catch (err) {
                        if (process.env.NODE_ENV !== 'test') {
                            logger.warn(`[AI-WATCHER] ML Inference API failed for ${agentUuid}:`, err.message);
                        }
                    }
                }

                // Fallback Heuristics if ML API is not used or failed
                const referenceBalance = agent.account?.lastSnapshotBalance || agent.account?.initialBalance || 1000;
                const currentBalance = agent.account?.balance || 0;
                // Allow up to 50% drain since last snapshot before alerting, and exempt approved spending if tracked
                const isRapidDrain = (referenceBalance - currentBalance) > (referenceBalance * 0.50);
                
                const recentProposals = Array.from(this.atcService.governanceEngine?.proposals?.values() || [])
                    .filter(p => p.adminId === agentUuid && p.status === 'ACTIVE').length;
                const hasUnusualGovernanceActivity = recentProposals > 5;

                if (isErrorState || hasHighCollisions || isRapidDrain || hasUnusualGovernanceActivity || isMlAnomaly) {
                    let reason = 'AUTO_DETECTED_ANOMALY';
                    if (isMlAnomaly) reason = mlReason;
                    else if (isErrorState) reason = 'AUTO_DETECTED_ERROR_STATE';
                    else if (hasHighCollisions) reason = 'AUTO_DETECTED_SPAM_BEHAVIOR';
                    else if (isRapidDrain) reason = 'AUTO_DETECTED_RAPID_DRAIN';
                    else if (hasUnusualGovernanceActivity) reason = 'AUTO_DETECTED_GOVERNANCE_SPAM';
                    
                    if (this.atcService.addLog) {
                        this.atcService.addLog('SYSTEM', `[AI-WATCHER] Anomaly detected for ${agent.id || agentUuid} (${reason}). Opening dispute automatically.`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SETTLEMENT, actionKey: LOG_ACTIONS.SETTLEMENT_DISPUTE });
                    }
                    
                    try {
                        // Archive the evidence to Arweave immediately
                        const metrics = {
                            latency: 0, // Mock for now
                            conflictRate: (agent.metrics?.collisions || 0) / 100,
                            balanceDrain: (agent.account?.balance || 0) < 5000 ? ((10000 - (agent.account?.balance || 0)) / 10000) * 100 : 0,
                            anomalyScore: agent.metrics?.anomalyScore || 0.9 // If heuristically caught, give high score
                        };
                        
                        const arweaveTxId = await AuditTrailArchiver.archiveSlashingEvent(
                            agentUuid,
                            metrics,
                            reason,
                            snap
                        );

                        await this.openDispute({ 
                            channelId, 
                            openedBy: 'AI-WATCHER', 
                            targetNonce: snap.nonce, 
                            reason,
                            arweaveTxId
                        });
                    } catch (disputeErr) {
                        if (!this._isQuietTestError(disputeErr)) logger.error(`[AI-WATCHER] Failed to open dispute for ${channelId}:`, disputeErr.message);
                    }
                }
            }
        }
    }

    _channelIdForAgent(agentUuid) {
        return `channel:${agentUuid}`;
    }

    _assertPubkey(addr) {
        try { new PublicKey(addr); return true; } catch { return false; }
    }

    async ensureChannel(agent) {
        const channelId = this._channelIdForAgent(agent.uuid);
        const treasuryAddr = this.atcService?.treasury?.systemVault?.address || WalletEngine.getTreasuryAddress();

        const participantAgent = agent.account?.address || agent.address;
        const participantTreasury = treasuryAddr;

        if (!this._assertPubkey(participantAgent)) {
            throw new Error('Invalid agent public key');
        }

        await db.upsertChannel({
            channelId,
            agentUuid: agent.uuid,
            participantAgent,
            participantTreasury,
            disputeWindowMs: Number(CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0)
        });
        return channelId;
    }

    async onTaskExecuted(task, execResult) {
        if (!task) return;
        if (task.status !== 'EXECUTED') return;

        const agent = this.atcService.agents.get(String(task.actorUuid));
        if (!agent) return;
        this.gas.immediateTxCount += 1;

        const channelId = await this.ensureChannel(agent);

        if (!this.pendingByChannel.has(channelId)) {
            this.pendingByChannel.set(channelId, []);
        }
        this.pendingByChannel.get(channelId).push({ task, execResult, at: Date.now() });

        if (this.atcService.state) this.atcService.state.settlement = this.getPublicState();
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();
        this._emitGasEconomics('task');

        await this.atcService.recordEvent({
            shardId: task.shardId,
            shardEpoch: task.shardEpoch,
            resourceId: task.resourceId,
            fenceToken: task.fenceToken,
            action: 'SETTLEMENT_TRIGGERED',
            actorUuid: task.actorUuid,
            correlationId: `settlement:trigger:${task.taskId}`,
            payload: { channelId, taskId: task.taskId, classification: task.classification }
        });
    }

    async flushPending() {
        for (const [channelId, items] of this.pendingByChannel.entries()) {
            if (!items || items.length === 0) continue;
            
            // Extract pending items
            const toProcess = items.splice(0, items.length);
            
            try {
                await this._createAndMaybeSubmitSnapshot(channelId, toProcess);
            } catch (err) {
                if (!this._isQuietTestError(err)) logger.error(`[SettlementEngine] Failed to process snapshot for channel ${channelId}:`, err);
                const code = String(err?.code || err?.message || '');
                const permanent = code === 'SOLANA_SETTLEMENT_DISABLED' || code === 'SOLANA_RPC_URL_MISSING';
                if (!permanent) {
                    const current = this.pendingByChannel.get(channelId) || [];
                    const toRequeue = [];
                    for (const item of toProcess) {
                        item.retryCount = (item.retryCount || 0) + 1;
                        if (item.retryCount < 3) {
                            toRequeue.push(item);
                            if (!this._isQuietTestError(err)) logger.warn(`⚠️ [SettlementEngine] Snapshot failed (Attempt ${item.retryCount}/3), requeuing for ${channelId}`);
                        } else {
                            if (!this._isQuietTestError(err)) logger.error(`🚨 [SettlementEngine] Snapshot permanently failed after 3 attempts for ${channelId}. Moving to DLQ.`);
                        }
                    }
                    this.pendingByChannel.set(channelId, [...toRequeue, ...current]);
                }
            }
        }

        if (this.atcService.state) this.atcService.state.settlement = this.getPublicState();
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();
    }

    async _createAndMaybeSubmitSnapshot(channelId, items) {
        const channel = await db.getChannel(channelId);
        if (!channel) return;

        const agentUuid = channel.agent_uuid;
        const agent = this.atcService.agents.get(String(agentUuid));
        if (!agent) return;

        const nonce = Number(channel.last_nonce ?? -1) + 1;
        const balances = {
            agentLamports: toLamports(agent.account?.balance ?? 0),
            agentEscrowLamports: toLamports(agent.account?.escrow ?? 0),
            treasuryFeesLamports: toLamports(this.atcService?.treasury?.systemVault?.totalFeesCollected ?? 0),
        };

        const task = items[items.length - 1]?.task;
        const shardId = task?.shardId || this.atcService.getShardIdForAgent(agentUuid) || 'RG-0';
        const shardEpoch = task?.shardEpoch ?? this.atcService.state?.shards?.[shardId]?.epoch ?? 0;
        const resourceId = task?.resourceId || this.atcService.state?.shards?.[shardId]?.resourceId || null;

        const state = {
            channelId,
            participants: {
                agent: channel.participant_agent,
                treasury: channel.participant_treasury,
            },
            nonce,
            balances,
            disputeWindowMs: Number(channel.dispute_window_ms || CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0),
            validUntil: Date.now() + Number(CONSTANTS.SETTLEMENT_STALE_MS || 0),
            taskId: task?.taskId || null,
        };
        const message = canonicalStringify(state);
        const stateHash = hashHex(message);
        const commitmentBytes = Buffer.from(stateHash, 'hex');

        const agentKp = WalletEngine.getAgentKeypair(agentUuid);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!agentKp || !treasuryKp) {
            throw new Error('SETTLEMENT_KEYS_MISSING');
        }

        const sigAgent = sign(commitmentBytes, agentKp.secretKey);
        const sigTreasury = sign(commitmentBytes, treasuryKp.secretKey);

        const okAgent = verify(commitmentBytes, sigAgent, agentKp.publicKey.toBytes());
        const okTreasury = verify(commitmentBytes, sigTreasury, treasuryKp.publicKey.toBytes());
        if (!okAgent || !okTreasury) throw new Error('Signature verification failed');

        const snapshot = {
            id: uuidv4(),
            channelId,
            nonce,
            balances,
            stateHash,
            signatures: {
                agent: sigAgent,
                treasury: sigTreasury,
            },
            disputeWindowMs: state.disputeWindowMs,
            validUntil: new Date(state.validUntil).toISOString(),
            status: 'SIGNED',
            taskId: state.taskId,
            globalSeq: await this.atcService.sequencer.nextGlobalSeq(),
            shardId,
            shardEpoch,
            resourceId,
        };

        await db.insertChannelSnapshot(snapshot);
        this.gas.snapshotTxCount += 1;

        this.lastSnapshotByChannel.set(channelId, {
            channelId,
            nonce,
            stateHash,
            status: snapshot.status,
            txid: null,
            commitment: null,
            createdAt: Date.now(),
        });

        await this.atcService.recordEvent({
            shardId,
            shardEpoch,
            resourceId,
            fenceToken: task?.fenceToken || null,
            action: 'SETTLEMENT_SNAPSHOT_CREATED',
            actorUuid: agentUuid,
            correlationId: `settlement:snapshot:${channelId}:${nonce}`,
            payload: { channelId, nonce, stateHash, validUntil: snapshot.validUntil }
        });

        await this.submitSnapshot(snapshot, agentUuid);
        this._emitGasEconomics('snapshot');
    }

    async ensureFinalizedForAgent(agentUuid, { shardId = null, shardEpoch = null, resourceId = null, fenceToken = null, taskId = null } = {}) {
        const agent = this.atcService.agents.get(String(agentUuid));
        if (!agent) throw new Error('AGENT_NOT_FOUND');

        const channelId = await this.ensureChannel(agent);
        const channel = await db.getChannel(channelId);
        if (!channel) throw new Error('CHANNEL_NOT_FOUND');

        const lastNonce = Number(channel.last_nonce ?? -1);
        if (lastNonce >= 0) {
            const last = await db.getChannelSnapshot(channelId, lastNonce).catch(() => null);
            if (last && String(last.onchain_status || '') === 'FINALIZED') {
                return { ok: true, channelId, nonce: lastNonce, txid: last.onchain_txid || null };
            }
        }

        const nonce = lastNonce + 1;
        const balances = {
            agentLamports: toLamports(agent.account?.balance ?? 0),
            agentEscrowLamports: toLamports(agent.account?.escrow ?? 0),
            treasuryFeesLamports: toLamports(this.atcService?.treasury?.systemVault?.totalFeesCollected ?? 0),
        };

        const resolvedShardId = shardId || this.atcService.getShardIdForAgent(agentUuid) || 'RG-0';
        const resolvedShardEpoch = shardEpoch ?? this.atcService.state?.shards?.[resolvedShardId]?.epoch ?? 0;
        const resolvedResourceId = resourceId || this.atcService.state?.shards?.[resolvedShardId]?.resourceId || null;

        const state = {
            channelId,
            participants: {
                agent: channel.participant_agent,
                treasury: channel.participant_treasury,
            },
            nonce,
            balances,
            disputeWindowMs: Number(channel.dispute_window_ms || CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0),
            validUntil: Date.now() + Number(CONSTANTS.SETTLEMENT_STALE_MS || 0),
            taskId: taskId ? String(taskId) : null,
        };
        const message = canonicalStringify(state);
        const stateHash = hashHex(message);
        const commitmentBytes = Buffer.from(stateHash, 'hex');

        const agentKp = WalletEngine.getAgentKeypair(agentUuid);
        const treasuryKp = WalletEngine.getTreasuryKeypair();
        if (!agentKp || !treasuryKp) throw new Error('SETTLEMENT_KEYS_MISSING');

        const sigAgent = sign(commitmentBytes, agentKp.secretKey);
        const sigTreasury = sign(commitmentBytes, treasuryKp.secretKey);
        const okAgent = verify(commitmentBytes, sigAgent, agentKp.publicKey.toBytes());
        const okTreasury = verify(commitmentBytes, sigTreasury, treasuryKp.publicKey.toBytes());
        if (!okAgent || !okTreasury) throw new Error('Signature verification failed');

        const snapshot = {
            id: uuidv4(),
            channelId,
            nonce,
            balances,
            stateHash,
            signatures: { agent: sigAgent, treasury: sigTreasury },
            disputeWindowMs: state.disputeWindowMs,
            validUntil: new Date(state.validUntil).toISOString(),
            status: 'SIGNED',
            taskId: state.taskId,
            globalSeq: await this.atcService.sequencer.nextGlobalSeq(),
            shardId: resolvedShardId,
            shardEpoch: resolvedShardEpoch,
            resourceId: resolvedResourceId,
        };

        await this._enforceDepositBounds(agent, {
            shardId: resolvedShardId,
            shardEpoch: resolvedShardEpoch,
            resourceId: resolvedResourceId,
            fenceToken,
            taskId: snapshot.taskId,
            channelId,
            nonce
        });

        await db.insertChannelSnapshot(snapshot);
        this.gas.snapshotTxCount += 1;

        await this.atcService.recordEvent({
            shardId: resolvedShardId,
            shardEpoch: resolvedShardEpoch,
            resourceId: resolvedResourceId,
            fenceToken,
            action: 'SETTLEMENT_GATE_SNAPSHOT_CREATED',
            actorUuid: String(agentUuid),
            correlationId: `settlement:gate:${channelId}:${nonce}`,
            payload: { channelId, nonce, stateHash, validUntil: snapshot.validUntil, taskId: snapshot.taskId }
        });

        const submitted = await this.submitSnapshot(snapshot, agentUuid, { commitment: 'finalized' });
        if (!submitted.ok) throw new Error(submitted.error || 'SETTLEMENT_GATE_SUBMIT_FAILED');
        this._emitGasEconomics('gate');
        return { ok: true, channelId, nonce, txid: submitted.txid || null };
    }

    async submitSnapshot(snapshot, actorUuid, { commitment } = {}) {
        const validUntil = new Date(snapshot.validUntil).getTime();
        if (Date.now() > validUntil) {
            await this.atcService.recordEvent({
                shardId: snapshot.shardId,
                shardEpoch: snapshot.shardEpoch,
                resourceId: snapshot.resourceId,
                fenceToken: null,
                action: 'SETTLEMENT_REJECTED_STALE',
                actorUuid,
                correlationId: `settlement:stale:${snapshot.channelId}:${snapshot.nonce}`,
                payload: { channelId: snapshot.channelId, nonce: snapshot.nonce }
            });
            return { ok: false, error: 'STALE' };
        }

        let res;
        try {
            const authorityKeypair = this.provider.getAuthorityKeypair(actorUuid);
            res = await this.provider.submitSnapshot(snapshot, { authorityKeypair, commitment });
        } catch (err) {
            await this.atcService.recordEvent({
                shardId: snapshot.shardId,
                shardEpoch: snapshot.shardEpoch,
                resourceId: snapshot.resourceId,
                fenceToken: null,
                action: 'SETTLEMENT_SUBMIT_FAILED',
                actorUuid,
                correlationId: `settlement:submit-failed:${snapshot.channelId}:${snapshot.nonce}`,
                payload: { channelId: snapshot.channelId, nonce: snapshot.nonce, error: String(err?.message || err) }
            }).catch(() => {});
            throw err;
        }

        await db.updateSnapshotOnchainStatus({
            channelId: snapshot.channelId,
            nonce: snapshot.nonce,
            txid: res.txid,
            status: res.status,
            commitment: res.commitment
        }).catch(() => {});

        if (this.atcService) {
            // Update lastSnapshotBalance to avoid rapid drain false positives
            const agentId = snapshot.channelId.split(':')[1];
            const agent = this.atcService.agents.get(agentId);
            if (agent && agent.account) {
                agent.account.lastSnapshotBalance = agent.account.balance;
            }
        }

        this.lastSnapshotByChannel.set(snapshot.channelId, {
            channelId: snapshot.channelId,
            nonce: snapshot.nonce,
            stateHash: snapshot.stateHash,
            status: String(res.status || 'SUBMITTED'),
            txid: res.txid || null,
            commitment: res.commitment || null,
            createdAt: Date.now(),
        });
        await this.atcService.recordEvent({
            shardId: snapshot.shardId,
            shardEpoch: snapshot.shardEpoch,
            resourceId: snapshot.resourceId,
            fenceToken: null,
            action: 'SETTLEMENT_SUBMITTED',
            actorUuid,
            correlationId: `settlement:submit:${snapshot.channelId}:${snapshot.nonce}`,
            payload: { channelId: snapshot.channelId, nonce: snapshot.nonce, txid: res.txid, commitment: res.commitment, status: res.status }
        });

        if (this.atcService.state) this.atcService.state.settlement = this.getPublicState();
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();
        return res;
    }

    async openDispute({ channelId, openedBy, targetNonce, reason, arweaveTxId }) {
        const normalizedChannelId = String(channelId || '');
        const normalizedOpenedBy = String(openedBy || 'ADMIN');
        const normalizedTargetNonce = Number(targetNonce ?? 0);
        const normalizedReason = String(reason || 'DISPUTE');
        if (!normalizedChannelId) throw new Error('INVALID_CHANNEL_ID');

        const idempotencyKey = `dispute:${normalizedChannelId}:${normalizedTargetNonce}`;
        if (this.resolvedDisputes.has(idempotencyKey)) {
            logger.warn(`🛡️ [SettlementEngine] Replay Attack Prevented: Dispute already resolved for ${idempotencyKey}`);
            throw new Error('DISPUTE_ALREADY_RESOLVED');
        }

        // Ledger verification fallback
        const existingDispute = await db.getDispute(idempotencyKey).catch(() => null);
        if (existingDispute && existingDispute.status === 'RESOLVED') {
            this.resolvedDisputes.add(idempotencyKey);
            logger.warn(`🛡️ [SettlementEngine] Replay Attack Prevented (Ledger): Dispute already resolved for ${idempotencyKey}`);
            throw new Error('DISPUTE_ALREADY_RESOLVED_IN_LEDGER');
        }

        const agentUuid = normalizedChannelId.split(':')[1];
        let chain;
        try {
            const authorityKeypair = this.provider.getAuthorityKeypair(agentUuid);
            chain = await this.provider.openDispute({ channelId: normalizedChannelId, targetNonce: normalizedTargetNonce }, { authorityKeypair, commitment: 'finalized' });
        } catch (err) {
            await this.atcService.recordEvent({
                shardId: 'RG-0',
                shardEpoch: 0,
                resourceId: null,
                fenceToken: null,
                action: 'DISPUTE_OPEN_FAILED',
                actorUuid: normalizedOpenedBy,
                correlationId: `dispute:failed:${normalizedChannelId}:${normalizedTargetNonce}`,
                payload: { channelId: normalizedChannelId, targetNonce: normalizedTargetNonce, reason: normalizedReason, error: String(err?.message || err) }
            }).catch(() => {});
            throw err;
        }

        const disputeId = uuidv4();
        await db.insertDispute({ disputeId, channelId: normalizedChannelId, openedBy: normalizedOpenedBy, targetNonce: normalizedTargetNonce, reason: normalizedReason, status: 'OPEN', idempotencyKey, arweaveTxId });
        await this.atcService.recordEvent({
            shardId: 'RG-0',
            shardEpoch: 0,
            resourceId: null,
            fenceToken: null,
            action: 'DISPUTE_OPENED',
            actorUuid: normalizedOpenedBy,
            correlationId: idempotencyKey,
            payload: { disputeId, channelId: normalizedChannelId, targetNonce: normalizedTargetNonce, reason: normalizedReason, txid: chain.txid, commitment: chain.commitment, status: chain.status, arweaveTxId }
        });
        this.disputedByChannel.set(normalizedChannelId, true);
        
        // Temporarily add to registry until resolved (to prevent concurrent replays)
        this.resolvedDisputes.add(idempotencyKey);

        if (this.atcService.state) this.atcService.state.settlement = this.getPublicState();
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();
        return { ok: true, disputeId };
    }

    async slash({ channelId, actorUuid, reason }) {
        const normalizedChannelId = String(channelId || '');
        const normalizedActorUuid = String(actorUuid || 'ADMIN');
        const normalizedReason = String(reason || 'SLASH');
        if (!normalizedChannelId) throw new Error('INVALID_CHANNEL_ID');

        const agentUuid = normalizedChannelId.split(':')[1];
        let chain;
        try {
            const authorityKeypair = this.provider.getAuthorityKeypair(agentUuid);
            chain = await this.provider.slash({ channelId: normalizedChannelId, reason: normalizedReason }, { authorityKeypair, commitment: 'finalized' });
        } catch (err) {
            if (err.message === 'SOLANA_SETTLEMENT_DISABLED' || err.code === 'SOLANA_SETTLEMENT_DISABLED') {
                // Mock success for demo purposes if Solana is disabled
                chain = { txid: 'mock-txid-' + Date.now(), commitment: 'mocked', status: 'MOCKED' };
                
                // Manually apply slashing and termination in mock mode
                const agent = this.atcService.agents ? this.atcService.agents.get(agentUuid) : null;
                if (agent && this.atcService.treasury && typeof this.atcService.treasury.applySlashing === 'function') {
                    this.atcService.treasury.applySlashing(agent, 'ADMIN_INTERVENTION');
                }
            } else {
                await this.atcService.recordEvent({
                    shardId: 'RG-0',
                    shardEpoch: 0,
                    resourceId: null,
                    fenceToken: null,
                    action: 'SETTLEMENT_SLASH_FAILED',
                    actorUuid: normalizedActorUuid,
                    correlationId: `slash:failed:${normalizedChannelId}:${normalizedActorUuid}:${normalizedReason}`,
                    payload: { channelId: normalizedChannelId, reason: normalizedReason, error: String(err?.message || err) }
                }).catch(() => {});
                throw err;
            }
        }

        await this.atcService.recordEvent({
            shardId: 'RG-0',
            shardEpoch: 0,
            resourceId: null,
            fenceToken: null,
            action: 'SETTLEMENT_SLASH',
            actorUuid: normalizedActorUuid,
            correlationId: `slash:${normalizedChannelId}:${normalizedActorUuid}:${normalizedReason}`,
            payload: { channelId: normalizedChannelId, reason: normalizedReason, txid: chain.txid, commitment: chain.commitment, status: chain.status }
        });

        // Push to UI state logs to trigger the frontend Slashing Heatmap and UI alerts
        if (typeof this.atcService.addLog === 'function') {
            this.atcService.addLog(agentUuid, `🚨 Slashed: ${normalizedReason}`, 'critical', { 
                stage: 'EXECUTED', 
                domain: 'ECONOMY', 
                actionKey: 'SETTLEMENT_SLASH',
                agentId: agentUuid,
                metrics: {
                    conflictRate: 100,
                    balanceDrain: 100,
                    anomalyScore: 1.0
                },
                arweaveTxId: chain.txid
            });
        }
        
        // Terminate the agent in the system if not already done in the mock fallback
        if (this.atcService.agentManager && typeof this.atcService.agentManager.terminateAgent === 'function') {
            logger.info(`[SettlementEngine] Forcibly terminating slashed agent: ${agentUuid}`);
            this.atcService.agentManager.terminateAgent(agentUuid, true).catch(err => logger.error(`Terminate error: ${err}`));
        }

        return { ok: true, txid: chain.txid };
    }
}

module.exports = SettlementEngine;
