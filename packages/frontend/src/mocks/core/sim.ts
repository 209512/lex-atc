import type { RiskVector8 } from '@lex-atc/shared';
import { LEX_CONSTITUTION, SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { db, broadcast, getAgent, updateAgent, addLog } from './db';
import { computeRiskVector, getOrbitPosition, resolveOrbitalLevel } from './physics';

const HOLDING_FEE_PER_TICK = 0.001;
const RISK_FLUCTUATION_AMPLITUDE = 0.045;

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
let motionTimer: ReturnType<typeof setInterval> | null = null;
const motionBuckets: Record<string, number> = {};
const MOTION_CYCLE_MS = 800;
const MOTION_POLL_MS = 200;
const hashToInt = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const safeRiskVector8 = (v: unknown): RiskVector8 => {
  if (!v || !Array.isArray(v) || v.length !== 8) return [0, 0, 0, 0, 0, 0, 0, 0];
  return [
    typeof v[0] === 'number' && Number.isFinite(v[0]) ? clamp01(v[0]) : 0,
    typeof v[1] === 'number' && Number.isFinite(v[1]) ? clamp01(v[1]) : 0,
    typeof v[2] === 'number' && Number.isFinite(v[2]) ? clamp01(v[2]) : 0,
    typeof v[3] === 'number' && Number.isFinite(v[3]) ? clamp01(v[3]) : 0,
    typeof v[4] === 'number' && Number.isFinite(v[4]) ? clamp01(v[4]) : 0,
    typeof v[5] === 'number' && Number.isFinite(v[5]) ? clamp01(v[5]) : 0,
    typeof v[6] === 'number' && Number.isFinite(v[6]) ? clamp01(v[6]) : 0,
    typeof v[7] === 'number' && Number.isFinite(v[7]) ? clamp01(v[7]) : 0,
  ];
};

const computeAgentScore = (agent: any, holdingTicks: number, collisionCount: number) => {
  const rep = typeof agent?.account?.reputation === 'number' ? agent.account.reputation : 100;
  const repRisk = 1 - clamp01(rep / 100);
  const holding = clamp01(holdingTicks / 12);
  const collisions = clamp01(collisionCount / 10);
  const slashed = agent?.status === 'SLASHED' ? 1 : 0;
  const priority = agent?.priority ? 0.15 : 0;
  const paused = agent?.isPaused ? 0.1 : 0;
  return clamp01(0.12 + repRisk * 0.25 + holding * 0.25 + collisions * 0.2 + slashed * 0.75 + priority + paused);
};

const applyFluctuation = (base: RiskVector8, seed: number, t: number): RiskVector8 => {
  const amp = RISK_FLUCTUATION_AMPLITUDE;
  return [
    clamp01(base[0] + (Math.sin(t * 0.9 + seed * 1.37 + 0 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 0 * 2.41) * 0.35) * amp),
    clamp01(base[1] + (Math.sin(t * 0.9 + seed * 1.37 + 1 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 1 * 2.41) * 0.35) * amp),
    clamp01(base[2] + (Math.sin(t * 0.9 + seed * 1.37 + 2 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 2 * 2.41) * 0.35) * amp),
    clamp01(base[3] + (Math.sin(t * 0.9 + seed * 1.37 + 3 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 3 * 2.41) * 0.35) * amp),
    clamp01(base[4] + (Math.sin(t * 0.9 + seed * 1.37 + 4 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 4 * 2.41) * 0.35) * amp),
    clamp01(base[5] + (Math.sin(t * 0.9 + seed * 1.37 + 5 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 5 * 2.41) * 0.35) * amp),
    clamp01(base[6] + (Math.sin(t * 0.9 + seed * 1.37 + 6 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 6 * 2.41) * 0.35) * amp),
    clamp01(base[7] + (Math.sin(t * 0.9 + seed * 1.37 + 7 * 1.11) * 0.65 + Math.sin(t * 1.7 + seed * 0.73 + 7 * 2.41) * 0.35) * amp),
  ];
};

const motionTick = () => {
  if (db.atcState.globalStop || db.agents.length === 0) {
    broadcast();
    return;
  }

  const now = Date.now();
  const t = now / 1000;
  let changed = false;

  const alive = new Set(db.agents.map((a) => a.uuid));
  for (const id of Object.keys(motionBuckets)) {
    if (!alive.has(id)) delete motionBuckets[id];
  }

  for (const a of db.agents) {
    const meta = db.agentMetas[a.uuid];
    if (!meta || a.isPaused) continue;

    const offset = hashToInt(a.uuid) % MOTION_CYCLE_MS;
    const bucket = Math.floor((now + offset) / MOTION_CYCLE_MS);
    if (motionBuckets[a.uuid] === bucket) continue;
    motionBuckets[a.uuid] = bucket;

    const activeTime = now - meta.spawnTime - meta.totalPausedMs;
    const score = computeAgentScore(a, meta.holdingTicks || 0, db.atcState.collisionCount || 0);
    const baseVector = safeRiskVector8(computeRiskVector(score, String(a.status || 'IDLE')));
    const riskVector = applyFluctuation(baseVector, meta.seed, t);
    const orbitalLevel = resolveOrbitalLevel(meta.seed, riskVector);
    updateAgent(a.uuid, {
      position: getOrbitPosition(meta.seed, activeTime),
      riskVector,
      orbitalLevel,
    });
    changed = true;
  }

  if (changed) broadcast();
};

const tick = () => {
  if (db.atcState.globalStop || db.agents.length === 0) {
    broadcast();
    return;
  }

  const now = Date.now();
  const active = db.agents.filter((a) => !a.isPaused && a.status !== 'SLASHED');
  if (active.length === 0) {
    broadcast();
    return;
  }

  const shouldTransfer =
    !db.atcState.holder ||
    db.atcState.holder === SYSTEM.ADMIN_HOLDER_ID ||
    Math.random() < 0.3;

  if (shouldTransfer && !db.atcState.overrideSignal) {
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

    if (active.length > 1 && Math.random() < 0.12) {
      db.atcState.collisionCount++;
      addLog('NETWORK', '⚠️ Collision detected!', 'warn', {
        domain: LOG_DOMAINS.SYSTEM,
        stage: LOG_STAGES.FAILED,
        actionKey: LOG_ACTIONS.LOCK_BLOCKED,
      });
    }

    const priorityActive = active.filter((a) => db.atcState.priorityAgents.includes(a.uuid));
    const pool = priorityActive.length > 0 ? priorityActive : active;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const lat = Math.floor(Math.random() * 80 + 10);

    db.atcState.holder = winner.uuid;
    db.atcState.latency = lat;
    db.atcState.timestamp = now;
    db.atcState.waitingAgents = active.filter((a) => a.uuid !== winner.uuid).map((a) => a.uuid);

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

    for (const a of active) {
      if (a.uuid === winner.uuid) continue;
      const roll = Math.random();
      updateAgent(a.uuid, {
        status: roll < 0.35 ? 'WAITING' : 'IDLE',
        activity: roll < 0.35 ? 'Awaiting lock...' : ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)],
      });
    }
  } else if (!db.atcState.overrideSignal) {
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
  if (!motionTimer) {
    motionTick();
    motionTimer = setInterval(motionTick, MOTION_POLL_MS);
  }
  tick();
  simTimer = setInterval(tick, 2000);
};

export const stopSimulation = () => {
  if (motionTimer) {
    clearInterval(motionTimer);
    motionTimer = null;
  }
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
};
