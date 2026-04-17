import { LogDomain, LogStage } from '@/contexts/atcTypes';
import { LOG_ACTIONS, LOG_DOMAINS, LOG_STAGES } from '@lex-atc/shared';

export const isEconomyLog = (message: string, type?: string) => {
  const normalized = String(message || '').toUpperCase();
  return type === 'reward' || /REWARD|FEE|SOL|COMPENSATION|SLASHED|ESCROW|PAID/.test(normalized);
};

export const stageFilterMap: Record<string, LogStage> = {
  [LOG_STAGES.REQUEST]: 'request',
  [LOG_STAGES.ACCEPTED]: 'accepted',
  [LOG_STAGES.EXECUTED]: 'executed',
  [LOG_STAGES.FAILED]: 'failed',
};

export const domainFilterOptions: Array<{ label: string; value: 'ALL' | LogDomain }> = [
  { label: 'ALL', value: 'ALL' },
  { label: 'SYS', value: LOG_DOMAINS.SYSTEM },
  { label: 'AGT', value: LOG_DOMAINS.AGENT },
  { label: 'LCK', value: LOG_DOMAINS.LOCK },
  { label: 'GOV', value: LOG_DOMAINS.GOVERNANCE },
  { label: 'STL', value: LOG_DOMAINS.SETTLEMENT },
  { label: 'ISO', value: LOG_DOMAINS.ISOLATION },
  { label: 'ECO', value: LOG_DOMAINS.ECONOMY },
];

export const knownActionGroups: Record<string, string[]> = {
  [LOG_DOMAINS.SYSTEM]: [LOG_ACTIONS.OVERRIDE, LOG_ACTIONS.RELEASE, LOG_ACTIONS.TOGGLE_STOP],
  [LOG_DOMAINS.AGENT]: [LOG_ACTIONS.SPAWN_AGENT, LOG_ACTIONS.SCALE_AGENTS, LOG_ACTIONS.PAUSE_AGENT, LOG_ACTIONS.RESUME_AGENT, LOG_ACTIONS.TERMINATE_AGENT, LOG_ACTIONS.TOGGLE_PRIORITY, LOG_ACTIONS.RENAME_AGENT],
  [LOG_DOMAINS.LOCK]: [LOG_ACTIONS.TRANSFER_LOCK, LOG_ACTIONS.LOCK_ACQUIRED, LOG_ACTIONS.LOCK_RELEASED],
  [LOG_DOMAINS.GOVERNANCE]: [LOG_ACTIONS.GOV_PROPOSAL_CREATED, LOG_ACTIONS.GOV_APPROVED, LOG_ACTIONS.GOV_EXECUTED, LOG_ACTIONS.GOV_CANCELLED],
  [LOG_DOMAINS.SETTLEMENT]: [LOG_ACTIONS.SETTLEMENT_DISPUTE, LOG_ACTIONS.SETTLEMENT_SLASH],
  [LOG_DOMAINS.ISOLATION]: [LOG_ACTIONS.TASK_FINALIZE, LOG_ACTIONS.TASK_ROLLBACK, LOG_ACTIONS.TASK_CANCEL],
  [LOG_DOMAINS.ECONOMY]: [LOG_ACTIONS.MINE_REWARD, LOG_ACTIONS.OVERRIDE_SLASH, LOG_ACTIONS.EVICTION_SLASH],
};

export const matchesPrimaryFilter = (filter: string, log: { type?: string; stage?: LogStage }) => {
  if (filter === 'ALL') return true;

  const logType = log.type?.toLowerCase();
  const activeFilter = filter.toLowerCase();

  if (activeFilter === 'critical') return logType === 'critical' || logType === 'error';
  if (activeFilter === 'lock') return logType === 'lock' || logType === 'success';
  if (activeFilter === 'sys') return logType === 'system';
  if (activeFilter === 'plc') return logType === 'policy';
  if (activeFilter in stageFilterMap) return log.stage === stageFilterMap[activeFilter];

  return logType === activeFilter;
};
