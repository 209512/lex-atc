import type { LexAgent, OrbitalLevel, RiskVector8, SharedATCState } from '@lex-atc/shared';
import { LEX_CONSTITUTION, SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { getOrbitPosition, resolveOrbitalLevel } from './physics';

export const BROADCAST_CHANNEL_NAME = 'lex-atc-state';
const STORAGE_KEY = 'lex-atc-mock-db';

type Subscriber = (payload: StatePayload) => void;
const subscribers = new Set<Subscriber>();

export const subscribe = (fn: Subscriber) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const randHex = (len: number) =>
  Array.from({ length: len }, () => (Math.random() * 16 | 0).toString(16)).join('');

export interface AgentMeta {
  seed: number;
  spawnTime: number;
  pausedAt: number | null;
  pauseReasons: { admin: boolean; globalStop: boolean };
  totalPausedMs: number;
  holdingTicks: number;
  orbitalLevel?: OrbitalLevel;
  riskVector?: RiskVector8;
}

export interface OrbitMeta {
  seed: number;
  spawnTime: number;
  totalPausedMs: number;
}

export type AgentWithOrbit = LexAgent & { orbit?: OrbitMeta };

export const makeProposal = (
  adminId: string,
  action: string,
  params: any,
  reason: string | null,
) => ({
  id: `prop-${Date.now()}-${randHex(4)}`,
  adminId,
  action,
  params: params ?? {},
  reason: reason ?? action,
  status: 'PENDING' as 'PENDING' | 'READY' | 'EXECUTED' | 'CANCELLED' | 'FAILED',
  approvals: [] as string[],
  threshold: 1,
  timelockMs: 0,
  executeAfter: Date.now(),
  createdAt: Date.now(),
  approvedAt: null as number | null,
  executedAt: null as number | null,
  cancelledAt: null as number | null,
});

interface MockDB {
  agents: LexAgent[];
  atcState: Omit<SharedATCState, 'trafficIntensity'> & { trafficIntensity?: number };
  agentConfigs: Record<string, any>;
  agentMetas: Record<string, AgentMeta>;
  governance: { proposals: ReturnType<typeof makeProposal>[] };
  isolation: { tasks: any[] };
  settlement: { channels: any[] };
  logs: any[];
  _nextIndex: number;
}

export interface StatePayload {
  agents: AgentWithOrbit[];
  state: Record<string, any>;
}

const makeAgent = (seed: number, counter: number): LexAgent => {
  const name = `AGT-${String(counter).padStart(3, '0')}`;
  const riskVector: RiskVector8 = [0, 0, 0, 0, 0, 0, 0, 0];
  const orbitalLevel = resolveOrbitalLevel(seed, riskVector);
  return {
    uuid: name,
    id: name,
    displayName: name,
    status: 'IDLE',
    activity: 'Idle — ready',
    account: {
      address: `0x${randHex(40)}`,
      balance: LEX_CONSTITUTION.ECONOMY.INITIAL_BALANCE,
      escrow: LEX_CONSTITUTION.ECONOMY.MIN_ESCROW,
      reputation: 100,
      difficulty: LEX_CONSTITUTION.MINING.BASE_DIFFICULTY,
      totalEarned: 0,
      lastWorkHash: '',
    },
    model: SYSTEM.DEFAULT_AGENT_MODEL,
    provider: 'mock',
    position: getOrbitPosition(seed, 0),
    lastUpdated: Date.now(),
    priority: false,
    color: `hsl(${(seed * 137.5) % 360}, 70%, 60%)`,
    isPaused: false,
    metrics: { ts: null },
    orbitalLevel,
    riskVector,
  };
};

const makeDefaultDB = (): MockDB => {
  const now = Date.now();
  const agentMetas: Record<string, AgentMeta> = {};
  const agents: LexAgent[] = [];
  for (let i = 0; i < 3; i++) {
    const counter = i + 1;
    const seed = counter - 1;
    const a = makeAgent(seed, counter);
    agents.push(a);
    agentMetas[a.uuid] = {
      seed,
      spawnTime: now,
      pausedAt: null,
      pauseReasons: { admin: false, globalStop: false },
      totalPausedMs: 0,
      holdingTicks: 0,
      orbitalLevel: a.orbitalLevel,
      riskVector: a.riskVector,
    };
  }
  return {
    agents,
    atcState: {
      resourceId: `RG-0-${now}`,
      holder: null,
      waitingAgents: [],
      priorityAgents: [],
      forcedCandidate: null,
      globalStop: false,
      collisionCount: 0,
      activeAgentCount: agents.length,
      overrideSignal: false,
      latency: 0,
      timestamp: now,
      trafficIntensity: 3,
    },
    agentConfigs: {},
    agentMetas,
    governance: { proposals: [] },
    isolation: {
      tasks: [
        {
          taskId: 'task-001',
          status: 'PENDING',
          classification: 'ADMIN_REVIEW',
          actorUuid: agents[0]?.uuid ?? 'AGT-001',
          createdAt: now - 20_000,
        },
      ],
    },
    settlement: { channels: [] },
    logs: [],
    _nextIndex: 4,
  };
};

const loadFromStorage = (): MockDB | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockDB>;
    if (!parsed.agents || parsed.agents.length === 0) return null;
    return parsed as MockDB;
  } catch (e) {
    void e;
    return null;
  }
};

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    void e;
  }
};

export const db: MockDB = (() => {
  const stored = loadFromStorage();
  if (!stored) return makeDefaultDB();
  const defaults = makeDefaultDB();
  const now = Date.now();
  const result: MockDB = {
    ...defaults,
    ...stored,
    agents: stored.agents,
    atcState: { ...defaults.atcState, ...stored.atcState },
    agentMetas: stored.agentMetas || {},
  };

  result.agents.forEach((a, i) => {
    if (!result.agentMetas[a.uuid]) {
      result.agentMetas[a.uuid] = {
        seed: i,
        spawnTime: now,
        pausedAt: null,
        pauseReasons: { admin: false, globalStop: false },
        totalPausedMs: 0,
        holdingTicks: 0,
        orbitalLevel: a.orbitalLevel,
        riskVector: a.riskVector,
      };
    } else {
      const meta = result.agentMetas[a.uuid] as any;
      if (!meta.pauseReasons) meta.pauseReasons = { admin: false, globalStop: false };
    }
  });

  return result;
})();

const setPauseReason = (uuid: string, reason: 'admin' | 'globalStop', enabled: boolean) => {
  const meta = db.agentMetas[uuid];
  if (!meta) return;
  const wasPaused = meta.pauseReasons.admin || meta.pauseReasons.globalStop;
  meta.pauseReasons[reason] = enabled;
  const isPausedNow = meta.pauseReasons.admin || meta.pauseReasons.globalStop;
  const now = Date.now();
  if (!wasPaused && isPausedNow && !meta.pausedAt) meta.pausedAt = now;
  if (wasPaused && !isPausedNow && meta.pausedAt) {
    meta.totalPausedMs += now - meta.pausedAt;
    meta.pausedAt = null;
  }
};

export const setGlobalStop = (enable: boolean) => {
  db.atcState.globalStop = Boolean(enable);
  for (const a of db.agents) setPauseReason(a.uuid, 'globalStop', Boolean(enable));
};

export const setAdminPause = (uuid: string, pause: boolean) => {
  setPauseReason(uuid, 'admin', Boolean(pause));
};

export const broadcast = () => {
  const now = Date.now();
  const agents: AgentWithOrbit[] = db.agents.map((a) => {
    const meta = db.agentMetas[a.uuid];
    if (!meta) return a;
    const effectivePausedMs = meta.totalPausedMs + (meta.pausedAt ? (now - meta.pausedAt) : 0);
    return {
      ...a,
      orbit: {
        seed: meta.seed,
        spawnTime: meta.spawnTime,
        totalPausedMs: effectivePausedMs,
      },
    };
  });
  const payload: StatePayload = {
    agents,
    state: {
      ...db.atcState,
      logs: db.logs.slice(-100),
      governance: db.governance,
      isolation: db.isolation,
      settlement: db.settlement,
      activeAgentCount: db.agents.length,
    },
  };

  for (const fn of subscribers) {
    try {
      fn(payload);
    } catch (e) {
      void e;
    }
  }

  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bc.postMessage(payload);
    bc.close();
  } catch (e) {
    void e;
  }

  persist();
};

export const getAgent = (uuid: string) =>
  db.agents.find((a) => a.uuid === uuid || a.id === uuid);

export const updateAgent = (uuid: string, patch: Partial<LexAgent>): boolean => {
  const idx = db.agents.findIndex((a) => a.uuid === uuid || a.id === uuid);
  if (idx === -1) return false;
  db.agents[idx] = { ...db.agents[idx], ...patch, lastUpdated: Date.now() };

  const meta = db.agentMetas[db.agents[idx].uuid];
  if (meta) {
    if (patch.orbitalLevel !== undefined) meta.orbitalLevel = patch.orbitalLevel;
    if (patch.riskVector !== undefined) meta.riskVector = patch.riskVector;
  }

  return true;
};

interface LogMeta {
  domain?: string;
  stage?: string;
  actionKey?: string;
}

export const addLog = (agentId: string, message: string, type = 'info', meta?: LogMeta) => {
  db.logs.push({
    id: `log-${Date.now()}-${randHex(4)}`,
    agentId,
    message,
    type,
    level: type,
    domain: meta?.domain,
    stage: meta?.stage,
    actionKey: meta?.actionKey,
    timestamp: Date.now(),
  });
  if (db.logs.length > 500) db.logs = db.logs.slice(-500);
};

export const scaleAgents = (count: number) => {
  const current = db.agents.length;
  const now = Date.now();
  if (count > current) {
    for (let i = 0; i < count - current; i++) {
      const counter = db._nextIndex++;
      const seed = counter - 1;
      const agent = makeAgent(seed, counter);
      db.agents.push(agent);
      db.agentMetas[agent.uuid] = {
        seed,
        spawnTime: now,
        pausedAt: null,
        pauseReasons: { admin: false, globalStop: false },
        totalPausedMs: 0,
        holdingTicks: 0,
        orbitalLevel: agent.orbitalLevel,
        riskVector: agent.riskVector,
      };
    }
  } else if (count < current) {
    const removed = db.agents.splice(count);
    for (const a of removed) {
      if (db.atcState.holder === a.uuid) db.atcState.holder = null;
      db.atcState.waitingAgents = db.atcState.waitingAgents.filter((id) => id !== a.uuid);
      db.atcState.priorityAgents = db.atcState.priorityAgents.filter((id) => id !== a.uuid);
      delete db.agentMetas[a.uuid];
    }
  }
  db.atcState.activeAgentCount = db.agents.length;
};

export const applyProposalAction = (action: string, params: any) => {
  switch (action) {
    case 'SCALE_AGENTS':
      scaleAgents(Number(params?.count) || 0);
      break;
    case 'PAUSE_AGENT': {
      const a = getAgent(params?.uuid);
      if (a) {
        setAdminPause(a.uuid, Boolean(params.pause));
        updateAgent(a.uuid, {
          isPaused: params.pause,
          status: params.pause ? 'PAUSED' : 'IDLE',
          activity: params.pause ? 'Paused by admin' : 'Idle — ready',
        });
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
      setGlobalStop(Boolean(params?.enable));
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
      const a = getAgent(params?.uuid);
      if (a) {
        db.atcState.forcedCandidate = a.uuid;
        db.atcState.holder = a.uuid;
        updateAgent(a.uuid, { status: 'ACTIVE', activity: 'Lock transferred by admin' });
      }
      break;
    }
    case 'SET_AGENT_CONFIG': {
      if (params?.uuid && params?.config) {
        db.agentConfigs[params.uuid] = params.config;
        const a = getAgent(params.uuid);
        if (a && params.config.model) updateAgent(a.uuid, { model: params.config.model });
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
      if (task) task.status = statusMap[action];
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
        const a = getAgent(params.actorUuid);
        if (a) {
          updateAgent(a.uuid, {
            status: 'SLASHED',
            account: {
              ...a.account,
              balance: +Math.max(0, a.account.balance - LEX_CONSTITUTION.ECONOMY.SLASH_FINE).toFixed(4),
            },
          });
        }
      }
      break;
    }
  }
  addLog('SYSTEM', `Action executed: ${action}`, 'system', {
    domain: LOG_DOMAINS.SYSTEM,
    stage: LOG_STAGES.EXECUTED,
  });
};
