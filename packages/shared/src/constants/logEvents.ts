// shared/src/constants/logEvents.ts

export const LOG_DOMAINS = {
  SYSTEM: 'system',
  AGENT: 'agent',
  LOCK: 'lock',
  GOVERNANCE: 'governance',
  SETTLEMENT: 'settlement',
  ISOLATION: 'isolation',
  ECONOMY: 'economy',
} as const;

export const LOG_STAGES = {
  REQUEST: 'request',
  ACCEPTED: 'accepted',
  EXECUTED: 'executed',
  FAILED: 'failed',
} as const;

// Action keys for consistent filtering
export const LOG_ACTIONS = {
  // System
  TOGGLE_STOP: 'TOGGLE_STOP',
  OVERRIDE: 'OVERRIDE',
  RELEASE: 'RELEASE',
  
  // Agent
  SPAWN_AGENT: 'SPAWN_AGENT',
  TERMINATE_AGENT: 'TERMINATE_AGENT',
  PAUSE_AGENT: 'PAUSE_AGENT',
  RESUME_AGENT: 'RESUME_AGENT',
  RENAME_AGENT: 'RENAME_AGENT',
  SCALE_AGENTS: 'SCALE_AGENTS',
  TOGGLE_PRIORITY: 'TOGGLE_PRIORITY',
  PRIORITY_ORDER: 'PRIORITY_ORDER',
  
  // Lock
  TRANSFER_LOCK: 'TRANSFER_LOCK',
  LOCK_ACQUIRED: 'LOCK_ACQUIRED',
  LOCK_RELEASED: 'LOCK_RELEASED',
  LOCK_WAIT: 'LOCK_WAIT',
  LOCK_BLOCKED: 'LOCK_BLOCKED',
  
  // Governance
  GOV_PROPOSAL_CREATED: 'GOV_PROPOSAL_CREATED',
  GOV_APPROVED: 'GOV_APPROVED',
  GOV_READY: 'GOV_READY',
  GOV_EXECUTED: 'GOV_EXECUTED',
  GOV_EXECUTION_FAILED: 'GOV_EXECUTION_FAILED',
  GOV_CANCELLED: 'GOV_CANCELLED',
  
  // Economy
  MINE_REWARD: 'MINE_REWARD',
  OVERRIDE_SLASH: 'OVERRIDE_SLASH',
  EVICTION_SLASH: 'EVICTION_SLASH',
  
  // Settlement
  SETTLEMENT_DISPUTE: 'SETTLEMENT_DISPUTE',
  SETTLEMENT_SLASH: 'SETTLEMENT_SLASH',
  
  // Isolation
  TASK_FINALIZE: 'TASK_FINALIZE',
  TASK_ROLLBACK: 'TASK_ROLLBACK',
  TASK_CANCEL: 'TASK_CANCEL',
  TASK_RETRY: 'TASK_RETRY',
} as const;

// Helper to construct consistent log metadata
export const createLogMeta = (
  domain: typeof LOG_DOMAINS[keyof typeof LOG_DOMAINS],
  actionKey: typeof LOG_ACTIONS[keyof typeof LOG_ACTIONS],
  stage: typeof LOG_STAGES[keyof typeof LOG_STAGES]
) => ({
  domain,
  actionKey,
  stage
});
