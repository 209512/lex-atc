import type { LexAgent } from '@lex-atc/shared';
import type { MockDB } from './db/types';
import { initDB } from './db/storage';
import { subscribe, broadcast as _broadcast } from './db/broadcast';
import { addLog as _addLog } from './db/logs';
import { applyProposalAction as _applyProposalAction } from './db/proposals';
import { getAgent as _getAgent, scaleAgents as _scaleAgents, setAdminPause as _setAdminPause, setGlobalStop as _setGlobalStop, updateAgent as _updateAgent } from './db/agents';

export { BROADCAST_CHANNEL_NAME } from './db/types';
export { makeProposal, randHex } from './db/factories';
export type { MockDB, AgentMeta, OrbitMeta, AgentWithOrbit, StatePayload } from './db/types';

export const db: MockDB = initDB();

export { subscribe };

export const setGlobalStop = (enable: boolean) => _setGlobalStop(db, enable);
export const setAdminPause = (uuid: string, pause: boolean) => _setAdminPause(db, uuid, pause);

export const broadcast = () => _broadcast(db);

export const getAgent = (uuid: string) => _getAgent(db, uuid);
export const updateAgent = (uuid: string, patch: Partial<LexAgent>): boolean => _updateAgent(db, uuid, patch);
export const addLog = (agentId: string, message: string, type = 'info', meta?: any) => _addLog(db, agentId, message, type, meta);
export const scaleAgents = (count: number) => _scaleAgents(db, count);
export const applyProposalAction = (action: string, params: any) => _applyProposalAction(db, action, params);
