/** @typedef {import('./settlementReducer.types').SettlementState} SettlementState */

/** @returns {SettlementState} */
const createSettlementState = () => ({
    pendingByChannel: new Map(),
    lastSnapshotByChannel: new Map(),
    disputedByChannel: new Map(),
    resolvedDisputes: new Set(),
});

module.exports = { createSettlementState };
