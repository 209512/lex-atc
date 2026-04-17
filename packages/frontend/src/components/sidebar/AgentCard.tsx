import { useShallow } from 'zustand/react/shallow';
// src/components/sidebar/AgentCard.tsx
import React, { useMemo, memo } from 'react';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { AgentStatusBadge } from '@/components/common/AgentStatusBadge';
import { AgentActionButtons } from '@/components/common/AgentActionButtons';
import { getAgentCardStyle } from '@/utils/agentStyles';
import { useATCStore } from '@/store/atc';
import { useAgentLogic } from '@/hooks/agent/useAgentLogic';
import { AgentIdentity, AgentMetrics, AgentLogs } from '@/components/agent';
import { Agent, ATCState, LogEntry } from '@/contexts/atcTypes';

interface AgentCardProps {
    agent: Agent;
    state: ATCState;
    isDark: boolean;
    isSelected: boolean;
    isPrioritySection: boolean;
    renamingId: string | null;
    newName: string;
    setNewName: (name: string) => void;
    onSelect: (id: string | null) => void;
    onStartRename: (id: string) => void;
    onConfirmRename: (id: string) => void;
    onCancelRename: () => void;
    onTogglePause: (id: string, pause: boolean) => void;
    onTransferLock: (id: string) => void;
    onTogglePriority: (id: string, priority: boolean) => void;
    onTerminate: (id: string) => void;
}

const AgentCardComponent = ({
    agent, state, isDark, isSelected, isPrioritySection, renamingId, newName, setNewName,
    onSelect, onStartRename, onConfirmRename, onCancelRename, onTogglePause, onTransferLock, onTogglePriority, onTerminate
}: AgentCardProps) => {
    const { playClick  } = useATCStore(useShallow(s => ({ playClick: s.actions.playClick })));
    const { isLocked, isPaused, isForced, isPriority, isOverride } = useAgentLogic(agent, state);

    // [최적화] 카드가 열려 있을 때만 로그 필터링 수행
    const filteredLogs = useMemo(() => {
        if (!isSelected) return []; 
        
        const allLogs = state?.logs || [];
        const myId = String(agent.id);
        const myDisplayName = agent.displayId || myId;
        
        return allLogs.filter((log: LogEntry) => {
            const logAgentId = String(log.agentId || '');
            const msg = (log.message || '').toUpperCase();
            const isMeMentioned = msg.includes(myId.toUpperCase()) || msg.includes(myDisplayName.toUpperCase());
            return logAgentId === myId || (['system', 'policy'].includes(logAgentId.toLowerCase()) && isMeMentioned);
        });
    }, [state?.logs, agent.id, agent.displayId, isSelected]);

    return (
        <Reorder.Item 
            value={agent.id} 
            dragListener={isPrioritySection} 
            className="list-none relative touch-none agent-item"
            data-testid={`agent-${agent.id}`}
        >
            <motion.div 
                layout
                whileDrag={{ scale: 1.02, zIndex: 50 }}
                className={clsx(
                    getAgentCardStyle({
                        isForced, 
                        isLocked, 
                        isPaused, 
                        isPriority, 
                        isSelected, 
                        isDark, 
                        overrideSignal: isOverride, 
                        globalStop: !!state?.globalStop
                    }),
                    "p-3 mb-2 group/card cursor-pointer transition-all duration-200 relative border rounded-sm shadow-sm overflow-hidden"
                )}
                onClick={() => renamingId !== agent.id && onSelect(isSelected ? null : agent.id)}
            >
                <div className="flex justify-between items-center mb-2 h-7 relative">
                    <div className="flex items-center gap-2 min-w-0 flex-1 h-full">
                        {isPrioritySection && (
                            <div className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-white/5 rounded">
                                <GripVertical size={14} className="text-gray-500 shrink-0" />
                            </div>
                        )}
                        <AgentIdentity 
                            agent={agent} state={state} isDark={isDark}
                            isRenaming={renamingId === agent.id}
                            newName={newName} setNewName={setNewName}
                            onStartRename={() => { if (playClick) playClick(); onStartRename(agent.id); }}
                            onConfirm={onConfirmRename} onCancel={onCancelRename}
                        />
                    </div>
                    <div className="flex shrink-0 ml-2 relative z-10" onClick={e => e.stopPropagation()}>
                        <AgentActionButtons 
                            agent={agent} state={state} 
                            onTogglePriority={onTogglePriority} 
                            onTogglePause={onTogglePause} 
                            onTerminate={onTerminate} 
                            onTransferLock={onTransferLock} 
                            tooltipPosition="left" 
                        />
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] gap-2 h-5">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <AgentStatusBadge 
                            isLocked={isLocked} 
                            isPaused={isPaused} 
                            isForced={isForced} 
                            isPriority={isPriority} 
                        />
                        <span className="truncate opacity-60 font-mono text-[9px]">{agent.activity || "IDLE"}</span>
                    </div>
                    <span className={clsx(
                        "px-1.5 py-0.5 rounded font-mono text-[9px] border font-bold uppercase shrink-0 min-w-[65px] text-center", 
                        isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200"
                    )}>
                        {agent.model}
                    </span>
                </div>

                <AnimatePresence>
                    {isSelected && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 pt-3 border-t border-white/10">
                                <AgentMetrics isDark={isDark} />
                                <AgentLogs logs={filteredLogs} isDark={isDark} isSelected={isSelected} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </Reorder.Item>
    );
};

export const AgentCard = memo(AgentCardComponent, (prevProps, nextProps) => {
    // Return true if passing nextProps to render would return the same result as passing prevProps to render
    if (prevProps.isDark !== nextProps.isDark) return false;
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    if (prevProps.isPrioritySection !== nextProps.isPrioritySection) return false;
    if (prevProps.renamingId !== nextProps.renamingId) return false;
    if (prevProps.newName !== nextProps.newName) return false;

    // Deep compare agent except position
    const pa = prevProps.agent;
    const na = nextProps.agent;
    if (pa.id !== na.id || pa.status !== na.status || pa.resource !== na.resource || pa.activity !== na.activity || pa.model !== na.model || pa.displayName !== na.displayName || pa.displayId !== na.displayId || pa.priority !== na.priority) return false;

    // Check relevant state fields (globalStop, holder, overrideSignal, logs length)
    const ps = prevProps.state;
    const ns = nextProps.state;
    if (ps?.globalStop !== ns?.globalStop) return false;
    if (ps?.holder !== ns?.holder) return false;
    if (ps?.overrideSignal !== ns?.overrideSignal) return false;
    
    // Only re-render if logs length changed when selected
    if (prevProps.isSelected && (ps?.logs?.length !== ns?.logs?.length)) return false;

    return true;
});
