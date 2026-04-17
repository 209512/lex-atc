// src/hooks/agent/useAgentLogic.ts
import { useMemo } from 'react';
import { Agent, ATCState } from '@/contexts/atcTypes';

/**
 * 에이전트의 현재 상태를 계산하고 UI 스타일 결정에 필요한 메타데이터를 반환합니다.
 * @param agent 개별 에이전트 객체
 * @param state ATC 전역 상태
 */
export const useAgentLogic = (agent: Agent, state: ATCState) => {
  const s = useMemo(() => state || { 
    holder: null, 
    globalStop: false, 
    waitingAgents: [], 
    forcedCandidate: null, 
    logs: [],
    overrideSignal: false 
  }, [state]);

  const isLocked = useMemo(() => s.holder === agent.id, [s.holder, agent.id]);

  const isPaused = useMemo(() => {
    const status = String(agent.status || '').toLowerCase();
    return status === 'paused' || agent.isPaused === true || s.globalStop === true;
  }, [agent.status, agent.isPaused, s.globalStop]);

  const isForced = useMemo(() => s.forcedCandidate === agent.id, [s.forcedCandidate, agent.id]);

  const isPriority = useMemo(() => !!agent.priority, [agent.priority]);

  const isOverride = useMemo(() => !!s.overrideSignal, [s.overrideSignal]);

  const isWaiting = useMemo(() => 
    s.waitingAgents?.includes(agent.id) || agent.status === 'waiting',
    [s.waitingAgents, agent.id, agent.status]
  );

  return {
    isLocked,
    isPaused,
    isForced,
    isPriority,
    isOverride,
    isWaiting,
    statusLabel: isOverride ? 'EMERGENCY' : 
                 isForced ? 'SEIZING...' : 
                 isPaused ? 'HALTED' : 
                 isLocked ? 'ACTIVE_CONTROL' : 
                 isWaiting ? 'IN_QUEUE' : 'STANDBY'
  };
};