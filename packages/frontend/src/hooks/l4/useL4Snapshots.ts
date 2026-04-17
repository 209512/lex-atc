import { useMemo } from 'react';
import { STATUS_CONTRACT_VERSION, StatusAxis, StatusCode, L4StatusSnapshot } from '@lex-atc/shared';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';

const iso = (t: number | null | undefined) => {
  if (!t) return new Date(0).toISOString();
  return new Date(Number(t)).toISOString();
};

const mkAxis = (axis: StatusAxis, code: StatusCode, updatedAt: string, message?: string, labelOverride?: string) => ({
  axis,
  code,
  updatedAt,
  message,
  labelOverride,
});

const emptyStates = () => ({
  isolation: mkAxis('isolation', 'NOT_STARTED', new Date(0).toISOString()),
  settlement: mkAxis('settlement', 'NOT_STARTED', new Date(0).toISOString()),
  rollback: mkAxis('rollback', 'NOT_STARTED', new Date(0).toISOString()),
  admin: mkAxis('admin', 'NOT_STARTED', new Date(0).toISOString()),
});

export const useL4Snapshots = () => {
  const state = useATCStore(useShallow(s => s.state));
  const agents = useATCStore(useShallow(s => s.agents));

  return useMemo(() => {
    const nowIso = new Date().toISOString();
    const snapshots: L4StatusSnapshot[] = [];

    const proposals = (state.governance?.proposals || []) as any[];
    const tasks = (state.isolation?.tasks || []) as any[];
    const channelPending = new Map((state.settlement?.pending || []).map((p: any) => [String(p.channelId), Number(p.pending || 0)]));
    const channelMeta = new Map((state.settlement?.channels || []).map((c: any) => [String(c.channelId), c]));

    const findProposalsBy = (pred: (p: any) => boolean) => proposals.filter(pred);

    for (const t of tasks) {
      const states = emptyStates();

      const createdAtIso = iso(t.createdAt);

      if (t.status === 'PENDING') {
        states.isolation = mkAxis('isolation', 'WAITING_ADMIN', createdAtIso, 'Sandbox pending approval', 'SANDBOX');
      } else if (t.status === 'FINALIZED') {
        states.isolation = mkAxis('isolation', 'IN_PROGRESS', iso(t.finalizedAt || t.createdAt), 'Commit approved; executing', 'COMMIT');
      } else if (t.status === 'EXECUTED') {
        states.isolation = mkAxis('isolation', 'SUCCEEDED', iso(t.executedAt || t.createdAt), 'Task executed', 'FINALIZED');
      } else if (t.status === 'ROLLED_BACK') {
        states.isolation = mkAxis('isolation', 'ABORTED', iso(t.rolledBackAt || t.createdAt), 'Rolled back', 'ROLLED_BACK');
      } else if (t.status === 'CANCELLED') {
        states.isolation = mkAxis('isolation', 'ABORTED', iso(t.rolledBackAt || t.createdAt), 'Cancelled', 'CANCELLED');
      } else if (t.status === 'TIMED_OUT') {
        states.isolation = mkAxis('isolation', 'FAILED', iso(t.timeoutAt || t.createdAt), 'Timed out', 'TIMEOUT');
      } else {
        states.isolation = mkAxis('isolation', 'UNKNOWN', createdAtIso, String(t.status || 'UNKNOWN'), 'UNKNOWN');
      }

      const channelId = `channel:${String(t.actorUuid)}`;
      const pm = channelPending.get(channelId) || 0;
      const cm: any = channelMeta.get(channelId);
      if (cm?.disputed) {
        states.settlement = mkAxis('settlement', 'WAITING_ADMIN', iso(cm.lastUpdatedAt), 'Channel disputed', 'DISPUTED');
      } else if ((pm as number) > 0) {
        states.settlement = mkAxis('settlement', 'IN_PROGRESS', nowIso, `Settlement pending (${pm})`, 'PENDING');
      } else if (cm?.lastNonce >= 0 && (cm.lastStatus === 'SUBMITTED' || cm.lastStatus === 'SIGNED')) {
        states.settlement = mkAxis('settlement', 'SUCCEEDED', iso(cm.lastUpdatedAt), 'Finalized snapshot', 'FINALIZED_SNAPSHOT');
      }

      const related = findProposalsBy(p => {
        if (!p) return false;
        const action = String(p.action || '');
        const params = p.params || {};
        if (action === 'TASK_FINALIZE' || action === 'TASK_ROLLBACK' || action === 'TASK_CANCEL') {
          return String(params.taskId) === String(t.taskId);
        }
        return false;
      });

      const latest = related.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).at(-1);
      if (latest) {
        if (latest.status === 'PENDING' || latest.status === 'READY') {
          states.admin = mkAxis('admin', 'WAITING_ADMIN', iso(latest.createdAt), `${latest.action} pending`, latest.status);
        }
        if (latest.status === 'EXECUTED') {
          states.admin = mkAxis('admin', 'SUCCEEDED', iso(latest.executedAt || latest.createdAt), `${latest.action} executed`, 'EXECUTED');
        }
        if (latest.status === 'CANCELLED') {
          states.admin = mkAxis('admin', 'ABORTED', iso(latest.cancelledAt || latest.createdAt), `${latest.action} cancelled`, 'CANCELLED');
        }

        if (latest.action === 'TASK_ROLLBACK') {
          if (latest.status === 'PENDING' || latest.status === 'READY') states.rollback = mkAxis('rollback', 'IN_PROGRESS', iso(latest.createdAt), 'Rollback scheduled', 'PENDING');
          if (latest.status === 'EXECUTED') states.rollback = mkAxis('rollback', 'SUCCEEDED', iso(latest.executedAt), 'Rollback executed', 'ROLLED_BACK');
          if (latest.status === 'CANCELLED') states.rollback = mkAxis('rollback', 'ABORTED', iso(latest.cancelledAt), 'Rollback cancelled', 'CANCELLED');
        }
      } else if (t.status === 'ROLLED_BACK') {
        states.rollback = mkAxis('rollback', 'SUCCEEDED', iso(t.rolledBackAt), 'Rollback applied', 'ROLLED_BACK');
      }

      const entityId = String(t.taskId);
      snapshots.push({
        contractVersion: STATUS_CONTRACT_VERSION,
        entityKind: 'TASK',
        entityId,
        occurredAt: createdAtIso,
        states,
        meta: { task: t, shard: state.shards?.[t.shardId] },
      });
    }

    for (const p of proposals) {
      const states = emptyStates();
      const createdAtIso = iso(p.createdAt);

      if (p.status === 'PENDING' || p.status === 'READY') {
        states.admin = mkAxis('admin', 'WAITING_ADMIN', createdAtIso, `${p.action} awaiting approvals`, p.status);
      } else if (p.status === 'EXECUTED') {
        states.admin = mkAxis('admin', 'SUCCEEDED', iso(p.executedAt || p.createdAt), `${p.action} executed`, 'EXECUTED');
      } else if (p.status === 'CANCELLED') {
        states.admin = mkAxis('admin', 'ABORTED', iso(p.cancelledAt || p.createdAt), `${p.action} cancelled`, 'CANCELLED');
      } else {
        states.admin = mkAxis('admin', 'UNKNOWN', createdAtIso, String(p.status || 'UNKNOWN'), 'UNKNOWN');
      }

      const action = String(p.action || '');
      if (action.startsWith('SETTLEMENT_')) {
        states.settlement = mkAxis('settlement', p.status === 'EXECUTED' ? 'SUCCEEDED' : 'IN_PROGRESS', createdAtIso, action, 'GOV_ACTION');
      }
      if (action === 'TASK_ROLLBACK') {
        states.rollback = mkAxis('rollback', p.status === 'EXECUTED' ? 'SUCCEEDED' : 'IN_PROGRESS', createdAtIso, 'Rollback workflow', 'GOV_ACTION');
      }
      if (action === 'OVERRIDE' || action === 'TRANSFER_LOCK' || action === 'TOGGLE_STOP') {
        states.admin = mkAxis('admin', p.status === 'EXECUTED' ? 'SUCCEEDED' : 'IN_PROGRESS', createdAtIso, action, 'DANGEROUS');
      }

      snapshots.push({
        contractVersion: STATUS_CONTRACT_VERSION,
        entityKind: 'PROPOSAL',
        entityId: String(p.id),
        occurredAt: createdAtIso,
        states,
        meta: { proposal: p },
      });
    }

    const channels = (state.settlement?.channels || []) as any[];
    for (const c of channels) {
      const states = emptyStates();
      const updatedIso = iso(c.lastUpdatedAt);
      if (c.disputed) {
        states.settlement = mkAxis('settlement', 'WAITING_ADMIN', updatedIso, 'Channel disputed', 'DISPUTED');
      } else if (c.lastStatus === 'SUBMITTED' || c.lastStatus === 'SIGNED') {
        states.settlement = mkAxis('settlement', 'SUCCEEDED', updatedIso, 'Finalized snapshot', 'FINALIZED_SNAPSHOT');
      } else {
        states.settlement = mkAxis('settlement', 'IN_PROGRESS', updatedIso, 'Settlement active', 'ACTIVE');
      }
      snapshots.push({
        contractVersion: STATUS_CONTRACT_VERSION,
        entityKind: 'CHANNEL',
        entityId: String(c.channelId),
        occurredAt: updatedIso,
        states,
        meta: { channel: c },
      });
    }

    for (const a of agents) {
      const states = emptyStates();
      const updatedIso = iso((a as any).lastUpdated);
      const isPaused = Boolean((a as any).isPaused) || String(a.status || '').toUpperCase() === 'PAUSED';
      const isSlashed = String(a.status || '').toUpperCase() === 'SLASHED';
      const isForced = Boolean(state.forcedCandidate && String(state.forcedCandidate) === String(a.uuid));
      const isPriority = Boolean((a as any).priority);

      if (isPaused) states.admin = mkAxis('admin', 'IN_PROGRESS', updatedIso, 'Suspended', 'SUSPENDED');
      if (isSlashed) states.admin = mkAxis('admin', 'FAILED', updatedIso, 'Slashed', 'SLASHED');
      if (isForced) states.admin = mkAxis('admin', 'IN_PROGRESS', nowIso, 'Forced takeover in flight', 'FORCED');
      if (isPriority) states.admin = mkAxis('admin', 'IN_PROGRESS', nowIso, 'Priority', 'PRIORITY');

      snapshots.push({
        contractVersion: STATUS_CONTRACT_VERSION,
        entityKind: 'AGENT',
        entityId: String(a.uuid),
        occurredAt: updatedIso,
        states,
        meta: { agent: a },
      });
    }

    const byId = new Map<string, L4StatusSnapshot>();
    for (const s of snapshots) byId.set(s.entityId, s);

    const summary = {
      contractVersion: state.contractVersion,
      serverTime: state.sse?.serverTime,
      taskCount: tasks.length,
      proposalCount: proposals.length,
      channelCount: channels.length,
    };

    return { snapshots, byId, summary, rawState: state };
  }, [state, agents]);
};
