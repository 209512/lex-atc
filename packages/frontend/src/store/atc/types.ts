import type { Agent, ATCState, LogEntry } from '@/contexts/atcTypes';

export interface ATCCoreState {
  state: ATCState;
  agents: Agent[];
  isAdminMuted: boolean;
}

export interface ATCLockState {
  deletedIds: Map<string, number>;
  fieldLocks: Map<string, Map<string, { value: any; expiry: number }>>;
  stateLocks: Map<string, { value: any; expiry: number }>;
}

export interface ATCActionsRegistryState {
  actions: any;
}

export interface ATCCoreActions {
  setState: (updater: ((prev: ATCState) => ATCState) | ATCState) => void;
  setAgents: (updater: ((prev: Agent[]) => Agent[]) | Agent[]) => void;
  setIsAdminMuted: (muted: boolean) => void;
  toggleAdminMute: () => void;
  addLog: (message: string, type?: LogEntry['type'], agentId?: string, meta?: Partial<LogEntry>) => void;
  updateAgentConfig: (uuid: string, config: any) => void;
  toggleGlobalStop: () => void;
  togglePause: (uuid: string, paused: boolean) => void;
  togglePriority: (uuid: string, priority: boolean) => void;
  transferLock: (uuid: string) => void;
  terminateAgent: (uuid: string) => void;
  setTrafficIntensity: (val: number) => void;
  triggerOverride: () => Promise<any>;
  releaseLock: () => Promise<any>;
  playAlert: () => void;
  playClick: () => void;
  updatePriorityOrder: (newOrder: string[]) => void;
  renameAgent: (uuid: string, newName: string) => Promise<void>;
  submitRename: (uuid: string, newName: string) => Promise<void>;
}

export interface ATCLockActions {
  markAction: (agentId: string, field: string, value: any, isDelete?: boolean) => void;
  clearDeletedAgent: (agentId: string) => void;
}

export interface ATCActionsRegistryActions {
  setActions: (actions: Record<string, any>) => void;
}

export type ATCStore = ATCCoreState &
  ATCLockState &
  ATCActionsRegistryState &
  ATCCoreActions &
  ATCLockActions &
  ATCActionsRegistryActions;

