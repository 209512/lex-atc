import type { MockDB, StatePayload } from './types';
import { BROADCAST_CHANNEL_NAME } from './types';
import { persist } from './storage';

type Subscriber = (payload: StatePayload) => void;

const subscribers = new Set<Subscriber>();

export const subscribe = (fn: Subscriber) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

export const broadcast = (db: MockDB) => {
  const now = Date.now();
  const agents = db.agents.map((a) => {
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

  persist(db);
};

