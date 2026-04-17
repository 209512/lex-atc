// src/hooks/agent/useCategorizedAgents.ts
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { useATCStore } from '@/store/atc';
import { Agent } from '@/contexts/atcTypes';

export const useCategorizedAgents = () => {
    const { agents = [], state  } = useATCStore(useShallow(s => ({ agents: s.agents, state: s.state })));

    return useMemo(() => {
        const priorityIds = state?.priorityAgents || [];

        const priorityAgents = priorityIds
            .map((id: string) => agents.find((a: Agent) => a.id === id))
            .filter((a): a is Agent => !!a) || [];

        const queueAgents = agents.filter((a: Agent) => !priorityIds.includes(a.id)) || [];

        const sortedNormalAgents = [...queueAgents].sort((a: Agent, b: Agent) => 
            (a.displayId || a.id).localeCompare((b.displayId || b.id), undefined, { 
                numeric: true, 
                sensitivity: 'base' 
            })) || [];

        return {
            priorityAgents,
            normalAgents: sortedNormalAgents,
            queueAgents,
            masterAgent: agents.find((a: Agent) => a.id === state?.holder) || null,
            priorityIds
        };
    }, [agents, state?.priorityAgents, state?.holder]);
};
