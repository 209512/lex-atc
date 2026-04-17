import type { ATCState } from '@/contexts/atcTypes';

export const createInitialATCState = (): ATCState => ({
  resourceId: 'BOOT',
  holder: null,
  waitingAgents: [],
  priorityAgents: [],
  forcedCandidate: null,
  globalStop: false,
  collisionCount: 0,
  logs: [],
  activeAgentCount: 0,
  overrideSignal: false,
  latency: 0,
  timestamp: Date.now(),
  trafficIntensity: 3,
});

