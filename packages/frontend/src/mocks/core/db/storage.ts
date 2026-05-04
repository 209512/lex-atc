import type { LexAgent } from '@lex-atc/shared';
import { SYSTEM } from '@lex-atc/shared';
import { makeAgent } from './factories';
import type { AgentMeta, MockDB } from './types';
import { STORAGE_KEY } from './types';

export const makeDefaultDB = (): MockDB => {
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

export const loadFromStorage = (): MockDB | null => {
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

export const persist = (db: MockDB) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    void e;
  }
};

export const initDB = (): MockDB => {
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

  if (!result.agentConfigs) {
    result.agentConfigs = {};
  }
  for (const a of result.agents) {
    if (!result.agentConfigs[a.uuid]) {
      result.agentConfigs[a.uuid] = {
        provider: 'mock',
        model: SYSTEM.DEFAULT_AGENT_MODEL,
        systemPrompt: SYSTEM.DEFAULT_SYSTEM_PROMPT,
      };
    }
  }

  return result;
};

