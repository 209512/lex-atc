// src/hooks/system/useATCStream.ts
import { useEffect, useRef, useCallback } from 'react';
import { Agent } from '@/contexts/atcTypes';
import { useATCStore } from '@/store/atc';
import { formatId } from '@/utils/agentIdentity';
import { frontendConfig } from '@/config/runtime';

const STREAM_URL = frontendConfig.sse.streamUrl;


const getSpiralPos = (i: number): [number, number, number] => {
  const r = 2.5 * Math.sqrt(i + 1);
  const theta = i * 137.508 * (Math.PI / 180);
  return [Math.cos(theta) * r, 0, Math.sin(theta) * r];
};

export const useATCStream = () => {
  const setState = useATCStore.getState().setState;
  const setAgents = useATCStore.getState().setAgents;
  const markActionStore = useATCStore.getState().markAction;

  const deletedIds = useRef<Set<string>>(new Set());
  const fieldLocks = useRef<Map<string, Map<string, { value: any, expiry: number }>>>(new Map());
  
  const reconnectTimeoutRef = useRef<any>(null);
  const dataBuffer = useRef<{ agents: any[] | null, state: any | null }>({ agents: null, state: null });
  const rafRef = useRef<number | null>(null);

  const flushBuffer = useCallback(() => {
    const { agents: bufferedAgents, state: bufferedState } = dataBuffer.current;
    const now = Date.now();

    if (bufferedAgents) {
      setAgents((prevAgents) => {
        return bufferedAgents.map((agent: any, i: number) => {
          const originalId = String(agent.id);
          
          if (deletedIds.current.has(originalId)) {
              deletedIds.current.delete(originalId);
          }

          const agentLocks = fieldLocks.current.get(originalId);
          let finalAgent = { ...agent };

          if (agentLocks) {
            agentLocks.forEach((lock, field) => {
              if (lock.expiry > now) finalAgent[field] = lock.value;
              else agentLocks.delete(field);
            });
            if (agentLocks.size === 0) fieldLocks.current.delete(originalId);
          }

          const rawPos = finalAgent.position;
          const prevAgent = prevAgents.find(a => a.id === originalId);
          const validPosition = (Array.isArray(rawPos) && rawPos.length === 3) 
            ? (rawPos as [number, number, number]) 
            : (prevAgent?.position || getSpiralPos(i)); 

          return {
            ...finalAgent,
            id: originalId,
            uuid: originalId,
            displayId: agent.displayName || formatId(originalId),
            status: String(finalAgent.status || 'idle').toLowerCase() as any,
            position: validPosition
          };
        }).filter(Boolean) as Agent[];
      });
      dataBuffer.current.agents = null;
    }

    if (bufferedState) {
      setState((prev) => {
        const newServerLogs = (bufferedState.logs || []).map((log: any) => ({
          ...log,
          agentId: String(log.agentId || 'system'),
          id: log.id || `S-${log.timestamp}`
        }));

        const MAX_LOGS = 1000; 
        
        const combined = [...prev.logs, ...newServerLogs];
        const uniqueMap = new Map();
        combined.forEach(l => uniqueMap.set(l.id, l));

        const sortedLogs = Array.from(uniqueMap.values())
          .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
          .slice(-MAX_LOGS);

        return { ...prev, ...bufferedState, logs: sortedLogs };
      });
      dataBuffer.current.state = null;
    }
    rafRef.current = null;
  }, [setAgents, setState]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    const ensureSession = async () => {
      try {
        await fetch(`${frontendConfig.api.baseUrl}/auth/session`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Session ensure failed:', err);
      }
    };

    const connect = async () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

      await ensureSession();
      eventSource = new EventSource(STREAM_URL, { withCredentials: true });
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data) {
            // Silently ignore empty parsed data
            return;
          }
          if (data.agents) dataBuffer.current.agents = data.agents;
          if (data.state) dataBuffer.current.state = data.state;
          if (!rafRef.current) rafRef.current = requestAnimationFrame(flushBuffer);
        } catch (err) { console.error("Stream Parsing Error:", err); }
      };
      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        reconnectTimeoutRef.current = setTimeout(() => { connect(); }, 3000);
      };
    };
    connect();
    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [flushBuffer]);

  const markAction = useCallback((agentId: string, field: string, value: any, isDelete: boolean = false) => {
      markActionStore(agentId, field, value, isDelete);
      const originalId = String(agentId);
      if (isDelete) {
          deletedIds.current.add(originalId);
          fieldLocks.current.delete(originalId);
          setState(prev => ({ ...prev, priorityAgents: (prev.priorityAgents || []).filter(id => id !== originalId) }));
      } else if (field) {
          if (!fieldLocks.current.has(originalId)) fieldLocks.current.set(originalId, new Map());
          fieldLocks.current.get(originalId)?.set(field, { value, expiry: Date.now() + 5000 });
      }
  }, [setState, markActionStore]);

  return { markAction };
};
