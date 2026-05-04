import type { LexAgent } from '@lex-atc/shared';
import type { MockDB } from './types';
import { makeAgent } from './factories';
import { setAdminPause, setGlobalStop } from './pause';

export const getAgent = (db: MockDB, uuid: string) =>
  db.agents.find((a) => a.uuid === uuid || a.id === uuid);

export const updateAgent = (db: MockDB, uuid: string, patch: Partial<LexAgent>): boolean => {
  const idx = db.agents.findIndex((a) => a.uuid === uuid || a.id === uuid);
  if (idx === -1) return false;
  db.agents[idx] = { ...db.agents[idx], ...patch, lastUpdated: Date.now() };

  const meta = db.agentMetas[db.agents[idx].uuid];
  if (meta) {
    if ((patch as any).orbitalLevel !== undefined) meta.orbitalLevel = (patch as any).orbitalLevel;
    if ((patch as any).riskVector !== undefined) meta.riskVector = (patch as any).riskVector;
  }

  return true;
};

export const scaleAgents = (db: MockDB, count: number) => {
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
        orbitalLevel: (agent as any).orbitalLevel,
        riskVector: (agent as any).riskVector,
      };
      if (db.atcState.globalStop) setGlobalStop(db, true);
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

export { setAdminPause, setGlobalStop };

