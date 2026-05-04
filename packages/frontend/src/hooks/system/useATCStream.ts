// src/hooks/system/useATCStream.ts
import { useEffect, useRef, useCallback } from 'react';
import { useATCStore } from '@/store/atc';
import { frontendConfig } from '@/config/runtime';
import { SseEventContractSchema } from '@lex-atc/shared';
import { mapSseAgents, mergeSseState } from './useATCStream.reducers';

type SseSingleton = {
  refCount: number;
  eventSource: EventSource | null;
  staleTimer: any;
  reconnectTimer: any;
  sessionEnsureInFlight: Promise<boolean> | null;
  sessionOkUntil: number;
};

const getSseSingleton = () => {
  const w = (typeof window !== 'undefined' ? (window as any) : null);
  const fallback: SseSingleton = {
    refCount: 0,
    eventSource: null,
    staleTimer: null,
    reconnectTimer: null,
    sessionEnsureInFlight: null,
    sessionOkUntil: 0,
  };
  if (!w) return fallback;
  const key = '__LEX_ATC_SSE_SINGLETON__';
  if (!w[key]) {
    w[key] = fallback;
  }
  return w[key] as SseSingleton;
};

export const useATCStream = () => {
  const setState = useATCStore.getState().setState;
  const setAgents = useATCStore.getState().setAgents;
  const stateReadyRef = useRef(false);
  const schemaWarnedRef = useRef(false);
  
  const dataBuffer = useRef<{ agents: any[] | null, state: any | null }>({ agents: null, state: null });
  const rafRef = useRef<number | null>(null);

  const flushBuffer = useCallback(() => {
    const { agents: bufferedAgents, state: bufferedState } = dataBuffer.current;
    const now = Date.now();
    useATCStore.getState().pruneLocks(now);
    const { deletedIds, fieldLocks, stateLocks } = useATCStore.getState();

    if (bufferedAgents) {
      setAgents((prevAgents) => {
        return mapSseAgents({ bufferedAgents, prevAgents, now, deletedIds, fieldLocks });
      });
      dataBuffer.current.agents = null;
    }

    if (bufferedState) {
      setState((prev) => {
        return mergeSseState({
          prev,
          bufferedState,
          now,
          maxLogs: frontendConfig.sse.maxLogs,
          stateLocks,
        });
      });
      if (!stateReadyRef.current) {
        stateReadyRef.current = true;
        try {
          const w = window as any;
          w.__LEX_ATC__ = w.__LEX_ATC__ || {};
          w.__LEX_ATC__.app = { ...(w.__LEX_ATC__.app || {}), stateReady: true };
          document.documentElement.dataset.lexAtcStateReady = '1';
        } catch (e) {
          void e;
        }
      }
      dataBuffer.current.state = null;
    }
    rafRef.current = null;
  }, [setAgents, setState]);

  useEffect(() => {
    let disposed = false;
    const singleton = getSseSingleton();
    singleton.refCount += 1;

    const closeAll = () => {
      if (singleton.eventSource) singleton.eventSource.close();
      singleton.eventSource = null;
      if (singleton.reconnectTimer) clearTimeout(singleton.reconnectTimer);
      singleton.reconnectTimer = null;
      if (singleton.staleTimer) clearInterval(singleton.staleTimer);
      singleton.staleTimer = null;
    };

    const ensureSession = async () => {
      if (disposed) return;
      const now = Date.now();
      if (now < singleton.sessionOkUntil) return;
      try {
        if (typeof document !== 'undefined') {
          const raw = String(document.cookie || '');
          if (raw.includes('lex_atc_csrf=')) {
            singleton.sessionOkUntil = Date.now() + Math.max(frontendConfig.sse.reconnectMs * 2, 5000);
            return;
          }
        }
      } catch {
        void 0;
      }
      if (singleton.sessionEnsureInFlight) {
        await singleton.sessionEnsureInFlight;
        return;
      }
      const doEnsure = async () => {
        try {
          if (disposed) return false;
          const res = await fetch(`${frontendConfig.api.baseUrl}/auth/session`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (disposed) return false;
          if (res.ok) {
            singleton.sessionOkUntil = Date.now() + Math.max(frontendConfig.sse.reconnectMs * 2, 5000);
            return true;
          }
          singleton.sessionOkUntil = Date.now() + Math.max(frontendConfig.sse.reconnectMs, 2000);
          return false;
        } catch (err: any) {
          if (disposed) return false;
          if (err?.name === 'AbortError') return false;
          useATCStore.getState().addLog(`SESSION ENSURE FAILED: ${err.message}`, 'error', 'SYSTEM');
          singleton.sessionOkUntil = 0;
          return false;
        }
      };
      const p = doEnsure().finally(() => {
        if (singleton.sessionEnsureInFlight === p) singleton.sessionEnsureInFlight = null;
      });
      singleton.sessionEnsureInFlight = p;
      await p;
    };

    const startStaleMonitor = () => {
      if (singleton.staleTimer) clearInterval(singleton.staleTimer);
      singleton.staleTimer = setInterval(() => {
        if (disposed) return;
        const now = Date.now();
        setState((prev) => {
          const sse = prev.sse || {};
          const connected = sse.connected !== false;
          const lastMessageAt = typeof sse.lastMessageAt === 'number' ? sse.lastMessageAt : null;
          const nextStale = Boolean(connected && lastMessageAt && now - lastMessageAt > frontendConfig.sse.staleMs);
          if (sse.stale === nextStale) return prev;
          return { ...prev, sse: { ...sse, stale: nextStale } };
        });
      }, 1000);
      if (singleton.staleTimer.unref) singleton.staleTimer.unref();
    };

    const connect = async () => {
      if (disposed) return;
      closeAll();

      await ensureSession();
      if (disposed) return;
      singleton.eventSource = new EventSource(frontendConfig.sse.streamUrl, { withCredentials: true });
      singleton.eventSource.onopen = () => {
        if (disposed) return;
        setState((prev) => ({
          ...prev,
          sse: { ...(prev.sse || {}), connected: true, connectedAt: Date.now(), stale: false }
        }));
      };
      singleton.eventSource.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data);
          if (!data) {
            // Silently ignore empty parsed data
            return;
          }
          const parsed = SseEventContractSchema.safeParse(data);
          const payload = parsed.success ? parsed.data : data;
          if (!parsed.success && !schemaWarnedRef.current) {
            schemaWarnedRef.current = true;
            useATCStore.getState().addLog('STREAM_SCHEMA_WARNING', 'warn', 'SYSTEM');
          }
          if (payload.agents) dataBuffer.current.agents = payload.agents;
          if (payload.state) dataBuffer.current.state = payload.state;
          if (!rafRef.current) rafRef.current = requestAnimationFrame(flushBuffer);
        } catch (err: any) {
          if (disposed) return;
          useATCStore.getState().addLog(`STREAM PARSING ERROR: ${err.message}`, 'error', 'SYSTEM');
        }
      };
      singleton.eventSource.onerror = () => {
        if (disposed) return;
        setState((prev) => ({
          ...prev,
          sse: { ...(prev.sse || {}), connected: false, lastErrorAt: Date.now(), stale: false }
        }));
        if (singleton.eventSource) singleton.eventSource.close();
        singleton.eventSource = null;
        if (singleton.reconnectTimer) clearTimeout(singleton.reconnectTimer);
        singleton.reconnectTimer = setTimeout(() => {
          if (disposed) return;
          connect();
        }, frontendConfig.sse.reconnectMs);
      };
    };
    connect();
    startStaleMonitor();
    return () => {
      disposed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      singleton.refCount = Math.max(0, singleton.refCount - 1);
      if (singleton.refCount === 0) closeAll();
    };
  }, [flushBuffer, setState]);

  return;
};
