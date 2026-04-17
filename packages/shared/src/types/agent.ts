// shared/src/types/agent.ts
export type AgentStatus = 'IDLE' | 'WAITING' | 'ACTIVE' | 'PAUSED' | 'SLASHED' | 'MINING' | 'ERROR';

export interface SovereignAccount {
  address: string;
  balance: number;
  escrow: number;
  reputation: number;
  difficulty: number;
  totalEarned: number;
  lastWorkHash: string;
}

export interface LexAgent {
  uuid: string;
  id: string;              
  displayName: string;
  displayId?: string;
  status: AgentStatus;
  activity: string;
  account: SovereignAccount;
  model: string;
  provider?: string;
  position: [number, number, number];
  lastUpdated: number;
  priority?: boolean;
  color?: string;
  isPaused?: boolean;
  metrics?: {
    ts?: string | null;
    lat?: string;
    tot?: string;
    load?: string;
  };
}

export interface SharedATCState {
  resourceId: string;
  holder: string | null;
  waitingAgents: string[];
  priorityAgents: string[];
  forcedCandidate: string | null;
  globalStop: boolean;
  collisionCount: number;
  activeAgentCount: number;
  overrideSignal: boolean; 
  latency: number;
  timestamp: number;
  trafficIntensity?: number; 
}
