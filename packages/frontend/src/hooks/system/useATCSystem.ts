// src/hooks/system/useATCSystem.ts
import { useCallback } from 'react';
import { LogEntry } from '@/contexts/atcTypes';
import { useATCStore } from '@/store/atc';

export const useATCSystem = () => {
  const setState = useATCStore.getState().setState;
  const setAgents = useATCStore.getState().setAgents;

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', agentId: string = 'SYSTEM') => {
    useATCStore.getState().addLog(message, type, agentId);
  }, []);

  return { 
    state: useATCStore(s => s.state), 
    setState, 
    agents: useATCStore(s => s.agents), 
    setAgents, 
    addLog 
  };
};