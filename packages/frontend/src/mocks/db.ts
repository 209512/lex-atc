// packages/frontend/src/mocks/db.ts
// In-memory virtual DB with localStorage persistence + pub-sub + BroadcastChannel

import type { LexAgent, SharedATCState } from '@lex-atc/shared';
import { LEX_CONSTITUTION, SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';

export const BROADCAST_CHANNEL_NAME = 'lex-atc-state';
const STORAGE_KEY = 'lex-atc-mock-db';
const HOLDING_FEE_PER_TICK = 0.001; // SOL deducted per 2s tick while holding lock

// Same-page pub-sub (for SSE ReadableStream)
type Subscriber = (payload: StatePayload) => void;
const subscribers = new Set<Subscriber>();

export const subscribe = (fn: Subscriber) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

// ── Orbital physics (mirrors backend PhysicsEngine) ──────────────────────────
const PHYSICS = {
  BASE_RADIUS: 5,
  RADIUS_STEP: 2.8,
  ORBIT_SPEED: 0.0003,
  Y_STEP: 1.5,
  Y_WOBBLE: 0.3,
};

const getOrbitPosition = (seed: number, activeTime: number): [number, number, number] => {
  const { BASE_RADIUS, RADIUS_STEP, ORBIT_SPEED, Y_STEP, Y_WOBBLE } = PHYSICS;
  const orbitLayer = seed % 3;
  const radius = BASE_RADIUS + orbitLayer * RADIUS_STEP;
  const direction = seed % 2 === 0 ? 1 : -1;
  const angle = seed * 1.25 + activeTime * ORBIT_SPEED * direction;
  const layerY = ((seed % 4) - 1.5) * Y_STEP;
  const wobble = Math.sin(activeTime * 0.002 + seed) * Y_WOBBLE;
  return [
    parseFloat((Math.cos(angle) * radius).toFixed(3)),
    parseFloat((layerY + wobble).toFixed(3)),
    parseFloat((Math.sin(angle) * radius).toFixed(3)),
  ];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const randHex = (len: number) =>
  Array.from({ length: len }, () => (Math.random() * 16 | 0).toString(16)).join('');

// Per-agent physics/economy metadata not stored on LexAgent
interface AgentMeta {
  seed: number;         // immutable orbital seed
  spawnTime: number;    // ms when agent was created
  pausedAt: number | null;
  totalPausedMs: number;
  holdingTicks: number; // consecutive ticks as lock holder
}

// ── Agent factory ─────────────────────────────────────────────────────────────
const makeAgent = (seed: number, counter: number): LexAgent => {
  const name = `AGT-${String(counter).padStart(3, '0')}`;
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
  };
};

// ── Governance proposal factory ───────────────────────────────────────────────
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

// ── DB type ───────────────────────────────────────────────────────────────────
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
  agents: LexAgent[];
  state: Record<string, any>;
}

// ── Default DB ────────────────────────────────────────────────────────────────
const makeDefaultDB = (): MockDB => {
  const now = Date.now();
  const agentMetas: Record<string, AgentMeta> = {};
  const agents: LexAgent[] = [];
  for (let i = 0; i < 3; i++) {
    const counter = i + 1;
    const seed = counter - 1;
    const a = makeAgent(seed, counter);
    agents.push(a);
    agentMetas[a.uuid] = { seed, spawnTime: now, pausedAt: null, totalPausedMs: 0, holdingTicks: 0 };
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

// ── Persistence ───────────────────────────────────────────────────────────────
const loadFromStorage = (): MockDB | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockDB>;
    if (!parsed.agents || parsed.agents.length === 0) return null;
    return parsed as MockDB;
  } catch {
    return null;
  }
};

const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { void 0; }
};

// ── DB singleton ──────────────────────────────────────────────────────────────
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
  // Reconstruct missing agentMeta entries (e.g. after schema migration)
  result.agents.forEach((a, i) => {
    if (!result.agentMetas[a.uuid]) {
      result.agentMetas[a.uuid] = { seed: i, spawnTime: now, pausedAt: null, totalPausedMs: 0, holdingTicks: 0 };
    }
  });
  return result;
})();

// ── Broadcast ─────────────────────────────────────────────────────────────────
export const broadcast = () => {
  const payload: StatePayload = {
    agents: db.agents,
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
    try { fn(payload); } catch { void 0; }
  }

  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bc.postMessage(payload);
    bc.close();
  } catch { void 0; }

  persist();
};

// ── CRUD helpers ──────────────────────────────────────────────────────────────
export const getAgent = (uuid: string) =>
  db.agents.find(a => a.uuid === uuid || a.id === uuid);

export const updateAgent = (uuid: string, patch: Partial<LexAgent>): boolean => {
  const idx = db.agents.findIndex(a => a.uuid === uuid || a.id === uuid);
  if (idx === -1) return false;
  db.agents[idx] = { ...db.agents[idx], ...patch, lastUpdated: Date.now() };
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
      db.agentMetas[agent.uuid] = { seed, spawnTime: now, pausedAt: null, totalPausedMs: 0, holdingTicks: 0 };
    }
  } else if (count < current) {
    const removed = db.agents.splice(count);
    for (const a of removed) {
      if (db.atcState.holder === a.uuid) db.atcState.holder = null;
      db.atcState.waitingAgents = db.atcState.waitingAgents.filter(id => id !== a.uuid);
      db.atcState.priorityAgents = db.atcState.priorityAgents.filter(id => id !== a.uuid);
      delete db.agentMetas[a.uuid];
    }
  }
  db.atcState.activeAgentCount = db.agents.length;
};

// ── Apply a governance proposal's action immediately ──────────────────────────
export const applyProposalAction = (action: string, params: any) => {
  switch (action) {
    case 'SCALE_AGENTS':
      scaleAgents(Number(params?.count) || 0);
      break;
    case 'PAUSE_AGENT': {
      const a = getAgent(params?.uuid);
      if (a) {
        const meta = db.agentMetas[a.uuid];
        if (meta) {
          if (params.pause && !meta.pausedAt) meta.pausedAt = Date.now();
          else if (!params.pause && meta.pausedAt) {
            meta.totalPausedMs += Date.now() - meta.pausedAt;
            meta.pausedAt = null;
          }
        }
        updateAgent(a.uuid, {
          isPaused: params.pause,
          status: params.pause ? 'PAUSED' : 'IDLE',
          activity: params.pause ? 'Paused by admin' : 'Idle — ready',
        });
      }
      break;
    }
    case 'TERMINATE_AGENT': {
      const idx = db.agents.findIndex(a => a.uuid === params?.uuid || a.id === params?.uuid);
      if (idx !== -1) {
        const [a] = db.agents.splice(idx, 1);
        if (db.atcState.holder === a.uuid) db.atcState.holder = null;
        db.atcState.waitingAgents = db.atcState.waitingAgents.filter(id => id !== a.uuid);
        db.atcState.priorityAgents = db.atcState.priorityAgents.filter(id => id !== a.uuid);
        db.atcState.activeAgentCount = db.agents.length;
        delete db.agentMetas[a.uuid];
      }
      break;
    }
    case 'TOGGLE_STOP':
      db.atcState.globalStop = Boolean(params?.enable);
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
      const task = db.isolation.tasks.find(t => t.id === params?.taskId);
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
      const ch = db.settlement.channels.find(c => c.channelId === params?.channelId);
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
              balance: +(Math.max(0, a.account.balance - LEX_CONSTITUTION.ECONOMY.SLASH_FINE)).toFixed(4),
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

// ── Simulation ────────────────────────────────────────────────────────────────
const ACTIVITIES = [
  'Processing task...',
  'Awaiting lock...',
  'Mining block...',
  'Executing action...',
  'Synchronizing...',
  'Verifying proof...',
  'Idle — ready',
];

let simTimer: ReturnType<typeof setInterval> | null = null;

const tick = () => {
  if (db.atcState.globalStop || db.agents.length === 0) {
    broadcast();
    return;
  }

  const now = Date.now();
  const active = db.agents.filter(a => !a.isPaused && a.status !== 'SLASHED');
  if (active.length === 0) { broadcast(); return; }

  // ── Update orbital positions for all agents ───────────────────────────────
  for (const a of db.agents) {
    const meta = db.agentMetas[a.uuid];
    if (!meta || a.isPaused) continue;
    const activeTime = now - meta.spawnTime - meta.totalPausedMs;
    updateAgent(a.uuid, { position: getOrbitPosition(meta.seed, activeTime) });
  }

  const shouldTransfer =
    !db.atcState.holder ||
    db.atcState.holder === SYSTEM.ADMIN_HOLDER_ID ||
    Math.random() < 0.3;

  if (shouldTransfer && !db.atcState.overrideSignal) {
    // ── Release current holder & distribute reward ────────────────────────
    const prev = db.atcState.holder;
    if (prev && prev !== SYSTEM.ADMIN_HOLDER_ID) {
      const prevA = getAgent(prev);
      if (prevA) {
        const reward = LEX_CONSTITUTION.ECONOMY.TASK_REWARD;
        updateAgent(prev, {
          status: 'IDLE',
          activity: 'Idle — ready',
          account: {
            ...prevA.account,
            balance: +(prevA.account.balance + reward).toFixed(4),
            totalEarned: +(prevA.account.totalEarned + reward).toFixed(4),
            reputation: Math.min(100, prevA.account.reputation + 1),
          },
        });
        addLog(prev, `💰 Task Reward: +${reward} SOL`, 'success', {
          domain: LOG_DOMAINS.ECONOMY,
          stage: LOG_STAGES.EXECUTED,
          actionKey: LOG_ACTIONS.MINE_REWARD,
        });
        addLog(prev, '🔓 Lock Released', 'lock', {
          domain: LOG_DOMAINS.LOCK,
          stage: LOG_STAGES.EXECUTED,
          actionKey: LOG_ACTIONS.LOCK_RELEASED,
        });
        if (db.agentMetas[prev]) db.agentMetas[prev].holdingTicks = 0;
      }
    }

    // ── Collision detection ───────────────────────────────────────────────
    if (active.length > 1 && Math.random() < 0.12) {
      db.atcState.collisionCount++;
      addLog('NETWORK', '⚠️ Collision detected!', 'warn', {
        domain: LOG_DOMAINS.SYSTEM,
        stage: LOG_STAGES.FAILED,
        actionKey: LOG_ACTIONS.LOCK_BLOCKED,
      });
    }

    // ── Elect new holder ──────────────────────────────────────────────────
    // Priority agents win first if any are active
    const priorityActive = active.filter(a => db.atcState.priorityAgents.includes(a.uuid));
    const pool = priorityActive.length > 0 ? priorityActive : active;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const lat = Math.floor(Math.random() * 80 + 10);

    db.atcState.holder = winner.uuid;
    db.atcState.latency = lat;
    db.atcState.timestamp = now;
    db.atcState.waitingAgents = active.filter(a => a.uuid !== winner.uuid).map(a => a.uuid);

    const winnerSnap = getAgent(winner.uuid)!;
    const entryFee = LEX_CONSTITUTION.ECONOMY.ENTRY_FEE;
    updateAgent(winner.uuid, {
      status: 'ACTIVE',
      activity: 'Executing action...',
      account: {
        ...winnerSnap.account,
        balance: +(Math.max(0, winnerSnap.account.balance - entryFee)).toFixed(4),
      },
      metrics: {
        ts: new Date().toISOString(),
        lat: `${lat}ms`,
        tot: `${lat + 20}ms`,
        load: `${Math.floor(Math.random() * 80 + 20)}%`,
      },
    });
    addLog(winner.uuid, `💸 Entry Fee: -${entryFee} SOL`, 'warn', {
      domain: LOG_DOMAINS.ECONOMY,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.MINE_REWARD,
    });
    addLog(winner.uuid, `🔒 Lock Acquired (lat: ${lat}ms)`, 'lock', {
      domain: LOG_DOMAINS.LOCK,
      stage: LOG_STAGES.ACCEPTED,
      actionKey: LOG_ACTIONS.LOCK_ACQUIRED,
    });
    if (db.agentMetas[winner.uuid]) db.agentMetas[winner.uuid].holdingTicks = 0;

    // Update non-winner states
    for (const a of active) {
      if (a.uuid === winner.uuid) continue;
      const roll = Math.random();
      updateAgent(a.uuid, {
        status: roll < 0.35 ? 'WAITING' : 'IDLE',
        activity: roll < 0.35 ? 'Awaiting lock...' : ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)],
      });
    }
  } else if (!db.atcState.overrideSignal) {
    // ── Holding Fee for current holder ────────────────────────────────────
    const holderId = db.atcState.holder;
    if (holderId && holderId !== SYSTEM.ADMIN_HOLDER_ID) {
      const holder = getAgent(holderId);
      if (holder) {
        const meta = db.agentMetas[holderId];
        if (meta) meta.holdingTicks++;
        if (holder.account.balance >= HOLDING_FEE_PER_TICK) {
          updateAgent(holderId, {
            account: {
              ...holder.account,
              balance: +(holder.account.balance - HOLDING_FEE_PER_TICK).toFixed(4),
            },
          });
          addLog(holderId, `⏱️ Holding Fee: -${HOLDING_FEE_PER_TICK} SOL`, 'warn', {
            domain: LOG_DOMAINS.ECONOMY,
            stage: LOG_STAGES.EXECUTED,
            actionKey: LOG_ACTIONS.MINE_REWARD,
          });
        }
      }
    }

    // ── Minor status drifts for non-holder agents ─────────────────────────
    for (const a of active) {
      if (a.uuid === db.atcState.holder) continue;
      if (Math.random() < 0.2) {
        const roll = Math.random();
        updateAgent(a.uuid, {
          status: roll < 0.25 ? 'MINING' : roll < 0.55 ? 'WAITING' : 'IDLE',
          activity: ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)],
        });
      }
    }
  }

  db.atcState.activeAgentCount = db.agents.length;
  db.atcState.trafficIntensity = Math.min(10, active.length * 1.5);
  broadcast();
};

export const startSimulation = () => {
  if (simTimer) return;
  tick();
  simTimer = setInterval(tick, 2000);
};

export const stopSimulation = () => {
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
};
