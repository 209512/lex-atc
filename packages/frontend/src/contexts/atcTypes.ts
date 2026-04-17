// src/contexts/atcTypes.ts
import { LogType } from '@/utils/logStyles';

export type LogDomain = 'system' | 'agent' | 'lock' | 'governance' | 'settlement' | 'isolation' | 'economy';
export type LogStage = 'request' | 'accepted' | 'executed' | 'failed';

export interface LogEntry {
  id: string;
  agentId?: string;
  message: string;
  messageStd?: string;
  messageTech?: string;
  timestamp: Date | number;
  type: LogType;
  stage?: LogStage;
  domain?: LogDomain;
  actionKey?: string;
  meta?: any;
}

export interface Agent {
  id: string;
  uuid: string;
  displayId?: string;
  displayName?: string;
  name?: string;
  model: string;
  status: 'active' | 'waiting' | 'idle' | 'paused' | 'processing' | 'PAUSED';
  activity?: string;
  priority?: boolean;
  isPaused?: boolean;
  color?: string;
  position: [number, number, number];
  resource?: string;
  account?: any;
  metrics?: any;
}

export interface ATCState {
  holder: string | null;
  waitingAgents: string[];
  priorityAgents: string[];
  forcedCandidate: string | null | { uuid: string; epoch?: number };
  globalStop: boolean;
  collisionCount: number;
  logs: LogEntry[];
  activeAgentCount: number;
  overrideSignal: boolean; 
  latency: number;
  trafficIntensity: number;
  governance?: any;
  isolation?: any;
  settlement?: any;
  shards?: any;
  contractVersion?: string;
  sse?: any;
  resourceId?: string;
  timestamp?: number;
}

export interface AgentMeta {
  isLocked: boolean;
  isWaiting: boolean;
  isPriority: boolean;
  isForced: boolean;
  isPaused: boolean;
  statusLabel: string;
  themeColor: string;
  glowIntensity: number;
}