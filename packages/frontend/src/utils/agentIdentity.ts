import { Agent } from '@/contexts/atcTypes';

export const getAgentStableId = (agent: Partial<Agent> | null | undefined) => String(agent?.uuid || agent?.id || '');

export const formatId = (id: string | null | undefined) => {
  if (!id) return '';
  const str = String(id);
  if (str.length > 12 && str.includes('-')) {
    return str.slice(0, 8);
  }
  return str.length > 12 ? str.slice(0, 8) : str;
};

export const getAgentLabel = (agent: Partial<Agent> | null | undefined) => {
  if (!agent) return '';
  if (agent.displayId) return String(agent.displayId);
  if (agent.displayName) return String(agent.displayName);
  const idStr = String(agent.id || agent.uuid || '');
  return idStr.length > 8 ? `AGT-${idStr.slice(0, 4)}` : idStr;
};

export const matchesAgentIdentity = (agent: Partial<Agent> | null | undefined, ref: string | null | undefined) => {
  const value = String(ref || '');
  if (!agent || !value) return false;
  return value === String(agent.uuid || '') ||
    value === String(agent.id || '') ||
    value === String(agent.displayId || '') ||
    value === String(agent.displayName || '');
};

