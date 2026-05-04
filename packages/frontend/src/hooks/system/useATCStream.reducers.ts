import { Agent } from '@/contexts/atcTypes';
import { formatId } from '@/utils/agentIdentity';
import { getOrbitPosition } from '@/utils/orbit';
import { normalizeLogMeta } from '@lex-atc/shared';

const getSpiralPos = (i: number): [number, number, number] => {
  const r = 2.5 * Math.sqrt(i + 1);
  const theta = i * 137.508 * (Math.PI / 180);
  return [Math.cos(theta) * r, 0, Math.sin(theta) * r];
};

const getOrbitPos = (agent: any, fallbackIndex: number, now: number): [number, number, number] => {
  const orbit = agent?.orbit;
  const seed = typeof orbit?.seed === 'number' ? orbit.seed : null;
  const spawnTime = typeof orbit?.spawnTime === 'number' ? orbit.spawnTime : null;
  const totalPausedMs = typeof orbit?.totalPausedMs === 'number' ? orbit.totalPausedMs : 0;
  if (seed === null || spawnTime === null) return getSpiralPos(fallbackIndex);
  const activeTime = Math.max(0, now - spawnTime - totalPausedMs);
  return getOrbitPosition(seed, activeTime);
};

export const mapSseAgents = ({
  bufferedAgents,
  prevAgents,
  now,
  deletedIds,
  fieldLocks,
}: {
  bufferedAgents: any[];
  prevAgents: any[];
  now: number;
  deletedIds: Map<string, any>;
  fieldLocks: Map<string, any>;
}): Agent[] => {
  const prevMap = new Map(prevAgents.map((a) => [String(a.id), a]));
  return bufferedAgents
    .map((agent: any, i: number) => {
      const originalId = String(agent.id);

      const deletedExpiry = deletedIds.get(originalId);
      if (typeof deletedExpiry === 'number' && deletedExpiry > now) return null;

      let finalAgent = { ...agent };
      const agentLocks = fieldLocks.get(originalId);

      if (agentLocks) {
        agentLocks.forEach((lock: any, field: string) => {
          if (lock.expiry > now) finalAgent[field] = lock.value;
        });
      }

      const rawPos = finalAgent.position;
      const prevAgent = prevMap.get(originalId);
      const validPosition =
        Array.isArray(rawPos) && rawPos.length === 3 ? (rawPos as [number, number, number]) : prevAgent?.position || getOrbitPos(finalAgent, i, now);

      return {
        ...finalAgent,
        id: originalId,
        uuid: originalId,
        displayId: finalAgent.displayName || formatId(originalId),
        status: String(finalAgent.status || 'idle').toLowerCase() as any,
        position: validPosition,
      };
    })
    .filter(Boolean) as Agent[];
};

export const mergeSseState = ({
  prev,
  bufferedState,
  now,
  maxLogs,
  stateLocks,
}: {
  prev: any;
  bufferedState: any;
  now: number;
  maxLogs: number;
  stateLocks: Map<string, any>;
}) => {
  const newServerLogs = (bufferedState.logs || []).map((log: any) => ({
    ...normalizeLogMeta(log || {}),
    agentId: String(log.agentId || 'system'),
    id: log.id || `S-${log.timestamp}`,
  }));

  const combined = [...(prev.logs || []), ...newServerLogs];
  const uniqueMap = new Map();
  combined.forEach((l) => uniqueMap.set(l.id, l));

  const sortedLogs = Array.from(uniqueMap.values())
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    .slice(-maxLogs);

  const incomingSse = bufferedState?.sse || {};
  let nextState = {
    ...bufferedState,
    sse: {
      ...(prev.sse || {}),
      ...(incomingSse || {}),
      connected: true,
      lastMessageAt: now,
      lastServerTime: typeof incomingSse?.serverTime === 'number' ? incomingSse.serverTime : prev.sse?.lastServerTime || null,
    },
  };

  stateLocks.forEach((lock: any, field: string) => {
    if (lock.expiry > now) nextState[field] = lock.value;
  });

  return { ...prev, ...nextState, logs: sortedLogs };
};

