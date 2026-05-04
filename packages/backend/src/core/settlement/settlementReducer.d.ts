import type { SettlementState, SettlementReducerAction } from './settlementReducer.types';

export declare const ACTIONS: Readonly<{
  ENQUEUE_TASK: 'ENQUEUE_TASK';
  DRAIN_CHANNEL: 'DRAIN_CHANNEL';
  REQUEUE_CHANNEL: 'REQUEUE_CHANNEL';
  RECORD_SNAPSHOT: 'RECORD_SNAPSHOT';
  MARK_DISPUTE: 'MARK_DISPUTE';
  MARK_RESOLVED_DISPUTE_KEY: 'MARK_RESOLVED_DISPUTE_KEY';
}>;

export declare function reduce(state: SettlementState, action: SettlementReducerAction): { state: SettlementState; out?: unknown };

export declare function enqueueTask(state: SettlementState, channelId: string, entry: Record<string, unknown>): SettlementState;
export declare function drainChannel(state: SettlementState, channelId: string): { state: SettlementState; drained: unknown[] };
export declare function requeueChannel(state: SettlementState, channelId: string, items: unknown[]): SettlementState;
export declare function recordSnapshot(
  state: SettlementState,
  record: { channelId: string; nonce: number; stateHash: string; status: string; txid?: string | null; commitment?: string | null }
): SettlementState;
export declare function markDispute(state: SettlementState, params: { channelId: string; idempotencyKey: string }): SettlementState;
export declare function markResolvedDisputeKey(state: SettlementState, idempotencyKey: string): SettlementState;

