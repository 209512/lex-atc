import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useATCStore } from '@/store/atc';
import { matchesAgentIdentity, getAgentLabel, formatId } from '@/utils/agentIdentity';
import { SYSTEM } from '@lex-atc/shared';
import { useIsMobile } from '@/hooks/system/useIsMobile';
import { RadarLiteHud } from './RadarLiteHud';
import { RadarLiteScene } from './RadarLiteScene';

export const RadarLite = () => {
  const agents = useATCStore(useShallow(s => s.agents));
  const holder = useATCStore(s => s.state.holder);
  const globalStop = useATCStore(s => s.state.globalStop);
  const priorityAgents = useATCStore(s => s.state.priorityAgents);
  const overrideSignal = useATCStore(s => s.state.overrideSignal);
  const { isDark, selectedAgentId, setSelectedAgentId     } = useUIStore(useShallow(s => ({ isDark: s.isDark, selectedAgentId: s.selectedAgentId, setSelectedAgentId: s.setSelectedAgentId })));
  const isMobile = useIsMobile();

  const holderLabel = useMemo(() => {
    if (!holder) return 'IDLE';
    if (holder === 'Human-Operator' || holder === SYSTEM.ADMIN_HOLDER_ID) return 'HUMAN';
    const holderAgent = agents.find((agent) => matchesAgentIdentity(agent, holder));
    return holderAgent ? getAgentLabel(holderAgent) : formatId(holder);
  }, [agents, holder]);

  const selectedAgent = useMemo(() => agents.find((agent) => matchesAgentIdentity(agent, selectedAgentId)), [agents, selectedAgentId]);

  return (
    <div className={clsx("absolute inset-0 overflow-hidden", isDark ? "bg-[#020617]" : "bg-slate-50")}>
      <RadarLiteScene
        agents={agents}
        holder={holder || null}
        globalStop={!!globalStop}
        priorityAgents={priorityAgents || []}
        overrideSignal={!!overrideSignal}
        isDark={isDark}
        isMobile={isMobile}
        selectedAgentId={selectedAgentId}
        setSelectedAgentId={setSelectedAgentId}
      />

      <RadarLiteHud isDark={isDark} holderLabel={holderLabel} agentsCount={agents.length} selectedAgent={selectedAgent || null} />
    </div>
  );
};

