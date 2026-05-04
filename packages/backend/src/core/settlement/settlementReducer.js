const {
    appendPending,
    drainPending,
    setPending,
    setLastSnapshot,
    buildSnapshotRecord,
    markDisputeOpened,
} = require('./stateMachine');

/** @typedef {import('./settlementReducer.types').SettlementState} SettlementState */
/** @typedef {import('./settlementReducer.types').SettlementReducerAction} SettlementReducerAction */
/** @typedef {{ type: 'ENQUEUE_TASK', channelId: string, entry: import('./settlementReducer.types').SettlementTaskQueueEntry }} EnqueueTaskAction */
/** @typedef {{ type: 'DRAIN_CHANNEL', channelId: string }} DrainChannelAction */
/** @typedef {{ type: 'REQUEUE_CHANNEL', channelId: string, items: import('./settlementReducer.types').SettlementTaskQueueEntry[] }} RequeueChannelAction */
/** @typedef {{ type: 'RECORD_SNAPSHOT', channelId: string, nonce: number, stateHash: string, status: string, txid?: string | null, commitment?: string | null }} RecordSnapshotAction */
/** @typedef {{ type: 'MARK_DISPUTE', channelId: string, idempotencyKey: string }} MarkDisputeAction */
/** @typedef {{ type: 'MARK_RESOLVED_DISPUTE_KEY', idempotencyKey: string }} MarkResolvedDisputeKeyAction */

/** @type {{
    ENQUEUE_TASK: 'ENQUEUE_TASK',
    DRAIN_CHANNEL: 'DRAIN_CHANNEL',
    REQUEUE_CHANNEL: 'REQUEUE_CHANNEL',
    RECORD_SNAPSHOT: 'RECORD_SNAPSHOT',
    MARK_DISPUTE: 'MARK_DISPUTE',
    MARK_RESOLVED_DISPUTE_KEY: 'MARK_RESOLVED_DISPUTE_KEY',
}} */
const ACTIONS = {
    ENQUEUE_TASK: 'ENQUEUE_TASK',
    DRAIN_CHANNEL: 'DRAIN_CHANNEL',
    REQUEUE_CHANNEL: 'REQUEUE_CHANNEL',
    RECORD_SNAPSHOT: 'RECORD_SNAPSHOT',
    MARK_DISPUTE: 'MARK_DISPUTE',
    MARK_RESOLVED_DISPUTE_KEY: 'MARK_RESOLVED_DISPUTE_KEY',
};

/** @param {unknown} value @param {string} name */
const requireString = (value, name) => {
    const v = value == null ? '' : String(value);
    if (!v) throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return v;
};

/** @param {unknown} value @param {string} name */
const requireNumber = (value, name) => {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return n;
};

/** @param {unknown} value @param {string} name */
const requireArray = (value, name) => {
    if (!Array.isArray(value)) throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return value;
};

/** @param {unknown} value @param {string} name */
const requireObject = (value, name) => {
    if (!value || typeof value !== 'object') throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return value;
};

/** @param {unknown} value @param {string} name */
const requireMap = (value, name) => {
    if (!(value instanceof Map)) throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return value;
};

/** @param {unknown} value @param {string} name */
const requireSet = (value, name) => {
    if (!(value instanceof Set)) throw new Error(`SETTLEMENT_REDUCER_INVALID_${name.toUpperCase()}`);
    return value;
};

/** @param {SettlementState} state @param {SettlementReducerAction} action */
const reduce = (state, action) => {
    const type = action?.type;
    requireObject(state, 'state');
    requireMap(state.pendingByChannel, 'pendingByChannel');
    requireMap(state.lastSnapshotByChannel, 'lastSnapshotByChannel');
    requireMap(state.disputedByChannel, 'disputedByChannel');
    requireSet(state.resolvedDisputes, 'resolvedDisputes');
    if (type === ACTIONS.ENQUEUE_TASK) {
        const a = /** @type {EnqueueTaskAction} */ (action);
        const channelId = requireString(a.channelId, 'channelId');
        const entry = /** @type {import('./settlementReducer.types').SettlementTaskQueueEntry} */ (requireObject(a.entry, 'entry'));
        return {
            state: {
                ...state,
                pendingByChannel: appendPending(state.pendingByChannel, channelId, entry),
            },
        };
    }

    if (type === ACTIONS.DRAIN_CHANNEL) {
        const a = /** @type {DrainChannelAction} */ (action);
        const channelId = requireString(a.channelId, 'channelId');
        const drained = drainPending(state.pendingByChannel, channelId);
        return { state: { ...state, pendingByChannel: drained.pendingByChannel }, out: drained.drained };
    }

    if (type === ACTIONS.REQUEUE_CHANNEL) {
        const a = /** @type {RequeueChannelAction} */ (action);
        const channelId = requireString(a.channelId, 'channelId');
        const items = requireArray(a.items || [], 'items');
        return {
            state: {
                ...state,
                pendingByChannel: setPending(state.pendingByChannel, channelId, items),
            },
        };
    }

    if (type === ACTIONS.RECORD_SNAPSHOT) {
        const a = /** @type {RecordSnapshotAction} */ (action);
        const record = buildSnapshotRecord({
            channelId: requireString(a.channelId, 'channelId'),
            nonce: requireNumber(a.nonce, 'nonce'),
            stateHash: requireString(a.stateHash, 'stateHash'),
            status: requireString(a.status, 'status'),
            txid: a.txid || null,
            commitment: a.commitment || null,
        });
        return {
            state: {
                ...state,
                lastSnapshotByChannel: setLastSnapshot(state.lastSnapshotByChannel, record),
            },
        };
    }

    if (type === ACTIONS.MARK_DISPUTE) {
        const a = /** @type {MarkDisputeAction} */ (action);
        const next = markDisputeOpened(
            { disputedByChannel: state.disputedByChannel, resolvedDisputes: state.resolvedDisputes },
            { channelId: requireString(a.channelId, 'channelId'), idempotencyKey: requireString(a.idempotencyKey, 'idempotencyKey') }
        );
        return { state: { ...state, disputedByChannel: next.disputedByChannel, resolvedDisputes: next.resolvedDisputes } };
    }

    if (type === ACTIONS.MARK_RESOLVED_DISPUTE_KEY) {
        const a = /** @type {MarkResolvedDisputeKeyAction} */ (action);
        const next = new Set(state.resolvedDisputes);
        next.add(requireString(a.idempotencyKey, 'idempotencyKey'));
        return { state: { ...state, resolvedDisputes: next } };
    }

    return { state };
};

/** @param {SettlementState} state @param {string} channelId @param {import('./settlementReducer.types').SettlementTaskQueueEntry} entry */
const enqueueTask = (state, channelId, entry) => reduce(state, { type: ACTIONS.ENQUEUE_TASK, channelId, entry }).state;
/** @param {SettlementState} state @param {string} channelId */
const drainChannel = (state, channelId) => {
    const res = reduce(state, { type: ACTIONS.DRAIN_CHANNEL, channelId });
    return { state: res.state, drained: res.out || [] };
};
/** @param {SettlementState} state @param {string} channelId @param {import('./settlementReducer.types').SettlementTaskQueueEntry[]} items */
const requeueChannel = (state, channelId, items) => reduce(state, { type: ACTIONS.REQUEUE_CHANNEL, channelId, items }).state;
/** @param {SettlementState} state @param {{ channelId: string, nonce: number, stateHash: string, status: string, txid?: string|null, commitment?: string|null }} record */
const recordSnapshot = (state, { channelId, nonce, stateHash, status, txid = null, commitment = null }) =>
    reduce(state, { type: ACTIONS.RECORD_SNAPSHOT, channelId, nonce, stateHash, status, txid, commitment }).state;
/** @param {SettlementState} state @param {{ channelId: string, idempotencyKey: string }} params */
const markDispute = (state, { channelId, idempotencyKey }) =>
    reduce(state, { type: ACTIONS.MARK_DISPUTE, channelId, idempotencyKey }).state;
/** @param {SettlementState} state @param {string} idempotencyKey */
const markResolvedDisputeKey = (state, idempotencyKey) =>
    reduce(state, { type: ACTIONS.MARK_RESOLVED_DISPUTE_KEY, idempotencyKey }).state;

module.exports = { ACTIONS, reduce, enqueueTask, drainChannel, requeueChannel, recordSnapshot, markDispute, markResolvedDisputeKey };
