export type SettlementTaskQueueEntry = Record<string, unknown>;

export type SettlementSnapshotRecord = {
  channelId: string;
  nonce: number;
  stateHash: string;
  status: string;
  txid: string | null;
  commitment: string | null;
  createdAt: number;
};

export type SettlementState = {
  pendingByChannel: Map<string, SettlementTaskQueueEntry[]>;
  lastSnapshotByChannel: Map<string, SettlementSnapshotRecord>;
  disputedByChannel: Map<string, boolean>;
  resolvedDisputes: Set<string>;
};

export type SettlementReducerAction =
  | { type: 'ENQUEUE_TASK'; channelId: string; entry: SettlementTaskQueueEntry }
  | { type: 'DRAIN_CHANNEL'; channelId: string }
  | { type: 'REQUEUE_CHANNEL'; channelId: string; items: SettlementTaskQueueEntry[] }
  | {
      type: 'RECORD_SNAPSHOT';
      channelId: string;
      nonce: number;
      stateHash: string;
      status: string;
      txid?: string | null;
      commitment?: string | null;
    }
  | { type: 'MARK_DISPUTE'; channelId: string; idempotencyKey: string }
  | { type: 'MARK_RESOLVED_DISPUTE_KEY'; idempotencyKey: string };

export declare const ACTIONS: Readonly<{
  ENQUEUE_TASK: 'ENQUEUE_TASK';
  DRAIN_CHANNEL: 'DRAIN_CHANNEL';
  REQUEUE_CHANNEL: 'REQUEUE_CHANNEL';
  RECORD_SNAPSHOT: 'RECORD_SNAPSHOT';
  MARK_DISPUTE: 'MARK_DISPUTE';
  MARK_RESOLVED_DISPUTE_KEY: 'MARK_RESOLVED_DISPUTE_KEY';
}>;

export declare function reduce(state: SettlementState, action: SettlementReducerAction): { state: SettlementState; out?: unknown };

