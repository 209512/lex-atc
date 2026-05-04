import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { Star, Shield } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { useTacticalActions } from '@/hooks/agent/useTacticalActions';
import { useCategorizedAgents } from '@/hooks/agent/useCategorizedAgents';
import { AgentCard } from '@/components/sidebar/AgentCard';
import { Agent } from '@/contexts/atcTypes';
import { Tooltip } from '@/components/common/Tooltip';

export const AgentList = () => {
    const { state, updatePriorityOrder  } = useATCStore(useShallow(s => ({ state: s.state, updatePriorityOrder: s.actions.updatePriorityOrder })));
    const { selectedAgentId, setSelectedAgentId, isDark  } = useUIStore(useShallow(s => ({ selectedAgentId: s.selectedAgentId, setSelectedAgentId: s.setSelectedAgentId, isDark: s.isDark })));
    const { 
        onTogglePause, onTransferLock, togglePriority, terminateAgent,
        renamingId, newName, setNewName, handleStartRename, handleCancelRename, handleConfirmRename
    } = useTacticalActions();

    const { priorityAgents, normalAgents, priorityIds } = useCategorizedAgents();

    const renderAgentItem = (agent: Agent, isPrioritySection: boolean) => {
        return (
            <AgentCard 
                key={agent.id}
                agent={agent}
                state={state}
                isDark={isDark}
                isSelected={selectedAgentId === agent.id}
                isPrioritySection={isPrioritySection}
                renamingId={renamingId}
                newName={newName}
                setNewName={setNewName}
                onSelect={setSelectedAgentId}
                onStartRename={handleStartRename}
                onConfirmRename={handleConfirmRename}
                onCancelRename={handleCancelRename}
                onTogglePause={onTogglePause}
                onTransferLock={onTransferLock}
                onTogglePriority={togglePriority}
                onTerminate={terminateAgent}
            />
        );
    };

    return (
        <div className="space-y-4 select-none pb-40 px-1">
            <div className="space-y-8">
                <section>
                    <Tooltip content="Priority Queue (Drag Sort)" position="bottom-right">
                        <label className="text-[10px] font-black text-yellow-500 mb-2 px-1 flex items-center gap-1.5 uppercase tracking-[0.2em]">
                            <Star size={10} fill="currentColor"/> Priority Stack
                        </label>
                    </Tooltip>
                    <Reorder.Group axis="y" values={priorityIds} onReorder={updatePriorityOrder} className="space-y-1">
                        {priorityAgents.map((agent: Agent) => renderAgentItem(agent, true))}
                    </Reorder.Group>
                </section>

                <section>
                    <Tooltip content="Standard Rotation Nodes" position="bottom-right">
                        <label className="text-[10px] font-black text-gray-500 mb-2 px-1 flex items-center gap-1.5 uppercase tracking-[0.2em]">
                            <Shield size={10}/> Standard Sector
                        </label>
                    </Tooltip>

                    <Reorder.Group 
                        axis="y" 
                        values={normalAgents.map((a: Agent) => a.id)} 
                        onReorder={() => {}} 
                        className="space-y-1"
                    >
                        {normalAgents.map((agent: Agent) => renderAgentItem(agent, false))}
                    </Reorder.Group>
                </section>
            </div>
        </div>
    );
};
