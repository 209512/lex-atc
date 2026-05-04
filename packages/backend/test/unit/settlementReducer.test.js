const { createSettlementState } = require('../../src/core/settlement/settlementState');
const { ACTIONS, reduce, enqueueTask, drainChannel, requeueChannel, recordSnapshot, markDispute, markResolvedDisputeKey } = require('../../src/core/settlement/settlementReducer');

const serializeState = (state) => ({
  pendingByChannel: Array.from(state.pendingByChannel.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, v]),
  lastSnapshotByChannel: Array.from(state.lastSnapshotByChannel.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, v]),
  disputedByChannel: Array.from(state.disputedByChannel.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, v]),
  resolvedDisputes: Array.from(state.resolvedDisputes.values()).sort(),
});

describe('settlementReducer', () => {
  test('enqueueTask and drainChannel roundtrip', () => {
    let state = createSettlementState();
    state = enqueueTask(state, 'channel:AGT-001', { task: { id: 't1' } });
    expect(state.pendingByChannel.get('channel:AGT-001').length).toBe(1);

    const drained = drainChannel(state, 'channel:AGT-001');
    state = drained.state;
    expect(drained.drained.length).toBe(1);
    expect(state.pendingByChannel.get('channel:AGT-001').length).toBe(0);
  });

  test('requeueChannel overwrites items', () => {
    let state = createSettlementState();
    state = requeueChannel(state, 'channel:AGT-001', [{ retryCount: 1 }]);
    expect(state.pendingByChannel.get('channel:AGT-001').length).toBe(1);
  });

  test('recordSnapshot updates lastSnapshotByChannel', () => {
    let state = createSettlementState();
    state = recordSnapshot(state, { channelId: 'channel:AGT-001', nonce: 3, stateHash: 'abc', status: 'SIGNED' });
    const snap = state.lastSnapshotByChannel.get('channel:AGT-001');
    expect(snap.nonce).toBe(3);
    expect(snap.stateHash).toBe('abc');
    expect(snap.status).toBe('SIGNED');
  });

  test('markDispute sets disputed and resolved', () => {
    let state = createSettlementState();
    state = markDispute(state, { channelId: 'channel:AGT-001', idempotencyKey: 'dispute:channel:AGT-001:1' });
    expect(state.disputedByChannel.get('channel:AGT-001')).toBe(true);
    expect(state.resolvedDisputes.has('dispute:channel:AGT-001:1')).toBe(true);
  });

  test('reduce validates payload', () => {
    const state = createSettlementState();
    expect(() => reduce(state, { type: ACTIONS.RECORD_SNAPSHOT, channelId: 'c', nonce: 'x', stateHash: 'h', status: 's' })).toThrow();
    expect(() => markResolvedDisputeKey(state, '')).toThrow();
  });

  test('action snapshots', () => {
    const realNow = Date.now;
    Date.now = () => 1700000000000;
    try {
      let state = createSettlementState();
      state = enqueueTask(state, 'channel:AGT-001', { task: { id: 't1' } });
      state = recordSnapshot(state, { channelId: 'channel:AGT-001', nonce: 1, stateHash: 'abc', status: 'SIGNED' });
      state = markDispute(state, { channelId: 'channel:AGT-001', idempotencyKey: 'dispute:channel:AGT-001:1' });
      expect(serializeState(state)).toMatchSnapshot();
    } finally {
      Date.now = realNow;
    }
  });
});
