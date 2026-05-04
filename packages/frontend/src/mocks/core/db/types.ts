import type { LexAgent, OrbitalLevel, RiskVector8, SharedATCState } from '@lex-atc/shared';

export const BROADCAST_CHANNEL_NAME = 'lex-atc-state';
export const STORAGE_KEY = 'lex-atc-mock-db';

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

export interface MockDB {
  agents: LexAgent[];
  atcState: Omit<SharedATCState, 'trafficIntensity'> & { trafficIntensity?: number };
  agentConfigs: Record<string, any>;
  agentMetas: Record<string, AgentMeta>;
  governance: { proposals: any[] };
  isolation: { tasks: any[] };
  settlement: { channels: any[] };
  logs: any[];
  _nextIndex: number;
}

export interface StatePayload {
  agents: AgentWithOrbit[];
  state: Record<string, any>;
}

