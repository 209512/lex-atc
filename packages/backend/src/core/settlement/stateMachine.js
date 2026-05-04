/** @typedef {import('./settlementReducer.types').SettlementTaskQueueEntry} SettlementTaskQueueEntry */
/** @typedef {import('./settlementReducer.types').SettlementSnapshotRecord} SettlementSnapshotRecord */

/** @param {Map<string, SettlementTaskQueueEntry[]>} pendingByChannel @param {string} channelId @param {SettlementTaskQueueEntry} entry */
const appendPending = (pendingByChannel, channelId, entry) => {
    const next = new Map(pendingByChannel);
    const prev = next.get(channelId) || [];
    next.set(channelId, [...prev, entry]);
    return next;
};

/** @param {Map<string, SettlementTaskQueueEntry[]>} pendingByChannel @param {string} channelId */
const drainPending = (pendingByChannel, channelId) => {
    const next = new Map(pendingByChannel);
    const prev = next.get(channelId) || [];
    next.set(channelId, []);
    return { pendingByChannel: next, drained: prev };
};

/** @param {Map<string, SettlementTaskQueueEntry[]>} pendingByChannel @param {string} channelId @param {SettlementTaskQueueEntry[]} items */
const setPending = (pendingByChannel, channelId, items) => {
    const next = new Map(pendingByChannel);
    next.set(channelId, [...(items || [])]);
    return next;
};

/** @param {Map<string, SettlementSnapshotRecord>} lastSnapshotByChannel @param {SettlementSnapshotRecord} record */
const setLastSnapshot = (lastSnapshotByChannel, record) => {
    const next = new Map(lastSnapshotByChannel);
    next.set(record.channelId, record);
    return next;
};

/** @param {{ channelId: string, nonce: number, stateHash: string, status: string, txid?: string|null, commitment?: string|null, createdAt?: number }} params @returns {SettlementSnapshotRecord} */
const buildSnapshotRecord = ({ channelId, nonce, stateHash, status, txid, commitment, createdAt }) => ({
    channelId,
    nonce,
    stateHash,
    status,
    txid: txid || null,
    commitment: commitment || null,
    createdAt: createdAt || Date.now(),
});

/** @param {{ channelId: string, openedBy?: string, targetNonce?: number, reason?: string, arweaveTxId?: string|null }} params */
const normalizeDisputeInput = ({ channelId, openedBy, targetNonce, reason, arweaveTxId }) => {
    const normalizedChannelId = String(channelId || '');
    const normalizedOpenedBy = String(openedBy || 'ADMIN');
    const normalizedTargetNonce = Number(targetNonce ?? 0);
    const normalizedReason = String(reason || 'DISPUTE');
    const normalizedArweaveTxId = arweaveTxId == null ? null : String(arweaveTxId);
    if (!normalizedChannelId) throw new Error('INVALID_CHANNEL_ID');
    const idempotencyKey = `dispute:${normalizedChannelId}:${normalizedTargetNonce}`;
    const agentUuid = normalizedChannelId.split(':')[1];
    return { normalizedChannelId, normalizedOpenedBy, normalizedTargetNonce, normalizedReason, normalizedArweaveTxId, idempotencyKey, agentUuid };
};

/** @param {{ resolvedDisputes: Set<string>, existingDispute: any, idempotencyKey: string }} params */
const shouldRejectDispute = ({ resolvedDisputes, existingDispute, idempotencyKey }) => {
    if (resolvedDisputes.has(idempotencyKey)) return 'DISPUTE_ALREADY_RESOLVED';
    if (existingDispute && existingDispute.status === 'RESOLVED') return 'DISPUTE_ALREADY_RESOLVED_IN_LEDGER';
    return null;
};

/** @param {{ disputedByChannel: Map<string, boolean>, resolvedDisputes: Set<string> }} state @param {{ channelId: string, idempotencyKey: string }} action */
const markDisputeOpened = ({ disputedByChannel, resolvedDisputes }, { channelId, idempotencyKey }) => {
    const nextDisputed = new Map(disputedByChannel);
    const nextResolved = new Set(resolvedDisputes);
    nextDisputed.set(channelId, true);
    nextResolved.add(idempotencyKey);
    return { disputedByChannel: nextDisputed, resolvedDisputes: nextResolved };
};

module.exports = {
    appendPending,
    drainPending,
    setPending,
    setLastSnapshot,
    buildSnapshotRecord,
    normalizeDisputeInput,
    shouldRejectDispute,
    markDisputeOpened,
};
