import React from 'react';
import { Agent } from '@/contexts/atcTypes';
import { AgentDrone } from '@/components/monitoring/radar/drone/AgentDrone';
import { matchesAgentIdentity } from '@/utils/agentIdentity';

interface RadarAgentLayerProps {
  agents: Agent[];
  holder: string | null;
  overrideSignal: boolean;
  globalStop: boolean;
  onSelectAgent: (id: string) => void;
  reducedEffects?: boolean;
  isCompact?: boolean;
}

export const RadarAgentLayer = ({ agents, holder, overrideSignal, globalStop, onSelectAgent, reducedEffects = false, isCompact = false }: RadarAgentLayerProps) => (
  <>
    {agents.map((agent) => (
      <AgentDrone
        key={agent.uuid || agent.id}
        id={agent.uuid || agent.id}
        position={(agent.position || [0, 0, 0]) as [number, number, number]}
        isLocked={matchesAgentIdentity(agent, holder)}
        isOverride={overrideSignal}
        color={agent.color || '#3b82f6'}
        onClick={onSelectAgent}
        isPaused={String(agent.status || '').toLowerCase() === 'paused' || agent.isPaused === true || globalStop}
        isPriority={!!agent.priority}
        reducedEffects={reducedEffects}
        isCompact={isCompact}
      />
    ))}
  </>
);

