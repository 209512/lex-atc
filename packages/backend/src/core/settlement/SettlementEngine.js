const CONSTANTS = require('../../config/constants');
const WalletEngine = require('../WalletEngine');
const SolanaSettlementProvider = require('./SolanaSettlementProvider');
const req = require;
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = req('@lex-atc/shared');
const logger = require('../../utils/logger');
const promClient = req('prom-client');

const AuditTrailArchiver = require('./AuditTrailArchiver');
const runAutoMonitoring = /** @type {any} */ (require('./settlementMonitoring'));
const { emitGasEconomics } = require('./settlementGas');
const { ensureChannel, onTaskExecuted, flushPending } = require('./settlementChannels');
const { ensureFinalizedForAgent, submitSnapshot } = require('./settlementSnapshots');
const { openDispute } = require('./settlementDisputes');
const { slash } = require('./settlementSlashing');
const { createSettlementRepo } = require('./settlementRepo');
const { createSettlementState } = require('./settlementState');

class SettlementEngine {
    constructor(atcService) {
        this.atcService = atcService;
        this.repo = createSettlementRepo();
        this.provider = SolanaSettlementProvider.fromEnv();
        const existing = promClient.register.getSingleMetric('lex_atc_settlement_contract_failures_total');
        this.contractFailures = existing || new promClient.Counter({
            name: 'lex_atc_settlement_contract_failures_total',
            help: 'Count of settlement contract/metadata failures',
            labelNames: ['op', 'reason']
        });
        this.intervalRef = null;
        this.state = createSettlementState();
        this.watcherIntervalRef = null;
        this.gas = {
            immediateTxCount: 0,
            snapshotTxCount: 0,
            lastUpdatedAt: 0,
            lastLoggedAt: 0,
        };
        AuditTrailArchiver.init();
    }

    _requireChainMeta(op, meta, extra = {}) {
        const txid = String(meta?.txid || '');
        const commitment = String(meta?.commitment || '');
        const status = String(meta?.status || '');
        if (txid && commitment && status) return { txid, commitment, status };

        const reason = 'SETTLEMENT_CHAIN_METADATA_MISSING';
        this.contractFailures.labels(String(op || 'unknown'), reason).inc(1);
        if (this.atcService?.addLog) {
            this.atcService.addLog('SYSTEM', `Settlement contract failure: ${reason} (op=${op})`, 'critical');
        }
        if (this.atcService?.recordEvent) {
            this.atcService.recordEvent({
                shardId: extra.shardId || 'RG-0',
                shardEpoch: Number(extra.shardEpoch ?? 0),
                resourceId: extra.resourceId || null,
                fenceToken: extra.fenceToken || null,
                action: 'SETTLEMENT_CONTRACT_FAILURE',
                actorUuid: String(extra.actorUuid || 'SYSTEM'),
                correlationId: `settlement:contract:${String(op || 'unknown')}:${Date.now()}`,
                payload: { op: String(op || 'unknown'), reason, meta: meta || null, ...extra }
            }).catch(() => {});
        }
        throw new Error(reason);
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
        for (const [channelId, items] of this.state.pendingByChannel.entries()) {
            if (items && items.length > 0) pending.push({ channelId, pending: items.length });
        }
        pending.sort((a, b) => a.channelId.localeCompare(b.channelId));

        const channels = [];
        for (const [channelId, snap] of this.state.lastSnapshotByChannel.entries()) {
            channels.push({
                channelId,
                lastNonce: snap.nonce,
                lastStateHash: snap.stateHash,
                lastStatus: snap.status,
                lastTxid: snap.txid || null,
                lastCommitment: snap.commitment || null,
                lastUpdatedAt: snap.createdAt,
                disputed: Boolean(this.state.disputedByChannel.get(channelId)),
            });
        }
        channels.sort((a, b) => a.channelId.localeCompare(b.channelId));

        return { pending, channels };
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
            }, 10000);
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
        return runAutoMonitoring(this);
    }

    async ensureChannel(agent) {
        return ensureChannel(this, agent);
    }

    async onTaskExecuted(task, execResult) {
        const res = await onTaskExecuted(this, task, execResult);
        emitGasEconomics(this, 'task');
        return res;
    }

    async flushPending() {
        const res = await flushPending(this);
        emitGasEconomics(this, 'snapshot');
        return res;
    }

    async ensureFinalizedForAgent(agentUuid, { shardId = null, shardEpoch = null, resourceId = null, fenceToken = null, taskId = null } = {}) {
        const res = await ensureFinalizedForAgent(this, agentUuid, { shardId, shardEpoch, resourceId, fenceToken, taskId });
        emitGasEconomics(this, 'gate');
        return res;
    }

    async submitSnapshot(snapshot, actorUuid, { commitment } = /** @type {any} */ ({})) {
        return submitSnapshot(this, snapshot, actorUuid, { commitment });
    }

    async openDispute({ channelId, openedBy, targetNonce, reason, arweaveTxId }) {
        return openDispute(this, { channelId, openedBy, targetNonce, reason, arweaveTxId });
    }

    async slash({ channelId, actorUuid, reason }) {
        return slash(this, { channelId, actorUuid, reason });
    }

    get pendingByChannel() {
        return this.state.pendingByChannel;
    }
    set pendingByChannel(v) {
        this.state = { ...this.state, pendingByChannel: v };
    }

    get lastSnapshotByChannel() {
        return this.state.lastSnapshotByChannel;
    }
    set lastSnapshotByChannel(v) {
        this.state = { ...this.state, lastSnapshotByChannel: v };
    }

    get disputedByChannel() {
        return this.state.disputedByChannel;
    }
    set disputedByChannel(v) {
        this.state = { ...this.state, disputedByChannel: v };
    }

    get resolvedDisputes() {
        return this.state.resolvedDisputes;
    }
    set resolvedDisputes(v) {
        this.state = { ...this.state, resolvedDisputes: v };
    }
}

module.exports = SettlementEngine;
