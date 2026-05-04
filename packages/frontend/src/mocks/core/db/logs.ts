import { LOG_ACTIONS, LOG_DOMAINS, LOG_STAGES, normalizeLogMeta } from '@lex-atc/shared';
import type { MockDB } from './types';
import { randHex } from './factories';

interface LogMeta {
  domain?: string;
  stage?: string;
  actionKey?: string;
}

export const addLog = (db: MockDB, agentId: string, message: string, type = 'info', meta?: LogMeta) => {
  const normalized = normalizeLogMeta(meta || {});
  db.logs.push({
    id: `log-${Date.now()}-${randHex(4)}`,
    agentId: agentId ? String(agentId) : 'system',
    message,
    type,
    level: type,
    domain: normalized.domain || LOG_DOMAINS.SYSTEM,
    stage: normalized.stage || LOG_STAGES.EXECUTED,
    actionKey: normalized.actionKey || LOG_ACTIONS.LOG,
    timestamp: Date.now(),
  });
  if (db.logs.length > 500) db.logs = db.logs.slice(-500);
};

