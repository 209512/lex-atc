import { useShallow } from 'zustand/react/shallow';
// src/components/sidebar/AgentList.tsx
import React from 'react';
import { Star, Shield, Play, Pause } from 'lucide-react';
import { Reorder } from 'framer-motion';
import clsx from 'clsx';
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
        renamingId, newName, setNewName, handleStartRename, handleCancelRename, handleConfirmRename,
        toggleGlobalStop 
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
            <div className="flex justify-end mb-6 px-1">
                <Tooltip content={state?.globalStop ? "Resume All" : "Halt All"} position="bottom-left">
                    <button 
                        onClick={(e) => { e.stopPropagation(); toggleGlobalStop(); }}
                        className={clsx(
                            "px-4 py-1.5 rounded-full text-[10px] font-black transition-all flex items-center gap-1.5 border shadow-md",
                            state?.globalStop 
                                ? "bg-red-500 text-white border-red-600 animate-pulse" 
                                : (isDark 
                                    ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700" 
                                    : "bg-white border-slate-400 text-slate-700 hover:bg-slate-50")
                        )}
                    >
                        {state?.globalStop ? <Play size={10} fill="currentColor"/> : <Pause size={10} fill="currentColor"/>}
                        {state?.globalStop ? "RESUME SYSTEM" : "HALT SYSTEM"}
                    </button>
                </Tooltip>
            </div>

            <div className="space-y-8">
                {/* Priority Section */}
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

                {/* Normal Section */}
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
