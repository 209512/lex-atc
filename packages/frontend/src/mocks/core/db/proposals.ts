import { LEX_CONSTITUTION, LOG_DOMAINS, LOG_STAGES, SYSTEM } from '@lex-atc/shared';
import type { MockDB } from './types';
import { addLog } from './logs';
import { getAgent, scaleAgents, setAdminPause, setGlobalStop, updateAgent } from './agents';

export const applyProposalAction = (db: MockDB, action: string, params: any) => {
  switch (action) {
    case 'SCALE_AGENTS':
      scaleAgents(db, Number(params?.count) || 0);
      break;
    case 'PAUSE_AGENT': {
      const a = getAgent(db, params?.uuid);
      if (a) {
        setAdminPause(db, a.uuid, Boolean(params.pause));
        updateAgent(db, a.uuid, {
          isPaused: params.pause,
          status: params.pause ? 'PAUSED' : 'IDLE',
          activity: params.pause ? 'Paused by admin' : 'Idle — ready',
        } as any);
      }
      break;
    }
    case 'TERMINATE_AGENT': {
      const idx = db.agents.findIndex((a) => a.uuid === params?.uuid || a.id === params?.uuid);
      if (idx !== -1) {
        const [a] = db.agents.splice(idx, 1);
        if (db.atcState.holder === a.uuid) db.atcState.holder = null;
        db.atcState.waitingAgents = db.atcState.waitingAgents.filter((id) => id !== a.uuid);
        db.atcState.priorityAgents = db.atcState.priorityAgents.filter((id) => id !== a.uuid);
        db.atcState.activeAgentCount = db.agents.length;
        delete db.agentMetas[a.uuid];
      }
      break;
    }
    case 'TOGGLE_STOP':
      setGlobalStop(db, Boolean(params?.enable));
      break;
    case 'OVERRIDE':
      db.atcState.overrideSignal = true;
      db.atcState.holder = SYSTEM.ADMIN_HOLDER_ID;
      break;
    case 'RELEASE':
      db.atcState.overrideSignal = false;
      if (db.atcState.holder === SYSTEM.ADMIN_HOLDER_ID) db.atcState.holder = null;
      break;
    case 'TRANSFER_LOCK': {
      const a = getAgent(db, params?.uuid);
      if (a) {
        db.atcState.forcedCandidate = a.uuid;
        db.atcState.holder = a.uuid;
        updateAgent(db, a.uuid, { status: 'ACTIVE', activity: 'Lock transferred by admin' } as any);
      }
      break;
    }
    case 'SET_AGENT_CONFIG': {
      if (params?.uuid && params?.config) {
        db.agentConfigs[params.uuid] = params.config;
        const a = getAgent(db, params.uuid);
        if (a && params.config.model) updateAgent(db, a.uuid, { model: params.config.model } as any);
      }
      break;
    }
    case 'TASK_FINALIZE':
    case 'TASK_ROLLBACK':
    case 'TASK_CANCEL':
    case 'TASK_RETRY': {
      const statusMap: Record<string, string> = {
        TASK_FINALIZE: 'FINALIZED',
        TASK_ROLLBACK: 'ROLLED_BACK',
        TASK_CANCEL: 'CANCELLED',
        TASK_RETRY: 'PENDING',
      };
      const taskId = String(params?.taskId ?? '');
      const task = db.isolation.tasks.find((t) => String((t as any).taskId ?? (t as any).id) === taskId);
      if (task) (task as any).status = statusMap[action];
      break;
    }
    case 'SETTLEMENT_DISPUTE':
      db.settlement.channels.push({
        channelId: params?.channelId,
        status: 'DISPUTED',
        lastStatus: 'DISPUTED',
        openedBy: params?.openedBy ?? 'admin',
        reason: params?.reason ?? 'DISPUTE',
        createdAt: Date.now(),
      });
      break;
    case 'SETTLEMENT_SLASH': {
      const ch = db.settlement.channels.find((c) => c.channelId === params?.channelId);
      if (ch) {
        ch.lastStatus = 'SLASHED';
      } else {
        db.settlement.channels.push({
          channelId: params?.channelId,
          status: 'SLASHED',
          lastStatus: 'SLASHED',
          createdAt: Date.now(),
        });
      }
      if (params?.actorUuid) {
        const a = getAgent(db, params.actorUuid);
        if (a) {
          updateAgent(db, a.uuid, {
            status: 'SLASHED',
            account: {
              ...a.account,
              balance: +Math.max(0, a.account.balance - LEX_CONSTITUTION.ECONOMY.SLASH_FINE).toFixed(4),
            },
          } as any);
        }
      }
      break;
    }
  }
  addLog(db, 'SYSTEM', `Action executed: ${action}`, 'system', {
    domain: LOG_DOMAINS.SYSTEM,
    stage: LOG_STAGES.EXECUTED,
  });
};

