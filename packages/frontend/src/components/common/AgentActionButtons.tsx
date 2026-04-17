// src/components/common/AgentActionButtons.tsx
import React from 'react';
import clsx from 'clsx';
import { Play, Pause, Trash2, Star, Zap, Edit2, Scale } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { Agent, ATCState } from '@/contexts/atcTypes';
import { useAgentLogic } from '@/hooks/agent/useAgentLogic';
import { useModalStore } from '@/store/ui/modalStore';

interface AgentActionButtonsProps {
    agent: Agent;
    state: ATCState;
    onTogglePriority: (id: string, enable: boolean) => void;
    onTogglePause: (id: string, isPaused: boolean) => void; 
    onTerminate: (id: string) => void;
    onTransferLock: (id: string) => void;
    layout?: 'row' | 'compact';
    showLabels?: boolean;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-right';
}

export const RenameButton = ({ onClick, className }: { onClick: (e: React.MouseEvent) => void, className?: string }) => (
    <Tooltip content="Rename Agent" position="right">
        <button 
            onClick={onClick} 
            className={clsx(
                "p-1 rounded transition-all hover:bg-blue-500/20 text-blue-500 cursor-pointer shrink-0", 
                className
            )}
        >
            <Edit2 size={11} />
        </button>
    </Tooltip>
);

const getActionButtonClass = (active: boolean, colorClass: string, hoverClass: string, disabled?: boolean, showLabels?: boolean) => 
    clsx(
        "p-1.5 rounded transition-all flex items-center justify-center gap-1",
        active ? colorClass : `text-gray-400 ${hoverClass}`,
        showLabels && "flex-1 text-[10px]",
        disabled ? "opacity-20 cursor-not-allowed grayscale pointer-events-none" : "cursor-pointer"
    );

export const AgentActionButtons = ({
    agent, state, onTogglePriority, onTogglePause, onTerminate, onTransferLock, layout = 'row', showLabels = false, tooltipPosition = 'bottom'
}: AgentActionButtonsProps) => {
    const { openOperationsModal } = useModalStore();
    const { isLocked, isPaused, isPriority } = useAgentLogic(agent, state);
    const isGlobalStopped = !!state.globalStop;
    const canSeize = !!(state.holder && !isLocked && !isPaused && !isGlobalStopped);
    const isPauseDisabled = isGlobalStopped;

    return (
        <div className={clsx("flex items-center gap-1", layout === 'compact' && "justify-between w-full mt-2")}>
            <Tooltip content="Escalate (Dispute/Slash)" position={tooltipPosition}>
                <button 
                    data-testid={`btn-slash-${agent.uuid || agent.id}`}
                    onClick={(e) => { e.stopPropagation(); openOperationsModal(agent.uuid || agent.id, 'slash'); }} 
                    className={getActionButtonClass(false, "bg-orange-500/10 text-orange-500 border border-orange-500/50", "hover:bg-orange-500/20 text-orange-500", false, showLabels)}
                >
                    <Scale size={12} className="shrink-0" />
                    {showLabels && <span className="truncate">Slash</span>}
                </button>
            </Tooltip>

            <Tooltip content={isPriority ? "Revoke Priority" : "Grant Priority"} position={tooltipPosition}>
                <button 
                    data-testid={`btn-priority-${agent.uuid || agent.id}`}
                    onClick={(e) => { e.stopPropagation(); onTogglePriority(agent.uuid || agent.id, !isPriority); }} 
                    className={getActionButtonClass(isPriority, "bg-yellow-500/10 text-yellow-500 border border-yellow-500/50", "hover:bg-yellow-400/10", false, showLabels)}
                >
                    <Star size={12} className={clsx("shrink-0", isPriority && "fill-current")} />
                    {showLabels && <span className="truncate">Priority</span>}
                </button>
            </Tooltip>

            <Tooltip content={isGlobalStopped ? "System Halted" : (canSeize ? "Force Lock Transfer" : "Cannot Seize")} position={tooltipPosition}>
                <button 
                    onClick={(e) => { e.stopPropagation(); onTransferLock(agent.uuid || agent.id); }} 
                    disabled={!canSeize} 
                    className={getActionButtonClass(canSeize, "bg-purple-500/10 text-purple-500 border border-purple-500/50", "hover:bg-purple-500/20", !canSeize, showLabels)}
                >
                    <Zap size={12} fill={canSeize ? "currentColor" : "none"} className="shrink-0" />
                    {showLabels && <span className="truncate">Seize</span>}
                </button>
            </Tooltip>

            <Tooltip content={isGlobalStopped ? "System Halted" : (isPaused ? "Resume" : "Pause")} position={tooltipPosition}>
                <button 
                    onClick={(e) => { e.stopPropagation(); onTogglePause(agent.uuid || agent.id, isPaused); }} 
                    disabled={isPauseDisabled}
                    className={getActionButtonClass(isPaused, "bg-zinc-700 text-zinc-100 border border-zinc-500", "hover:bg-zinc-600", isPauseDisabled, showLabels)}
                >
                    {isPaused ? <Play size={12} fill="currentColor" className="shrink-0" /> : <Pause size={12} fill="currentColor" className="shrink-0" />}
                    {showLabels && <span className="truncate">{isPaused ? 'Resume' : 'Pause'}</span>}
                </button>
            </Tooltip>

            <Tooltip content="Terminate Agent" position={tooltipPosition}>
                <button 
                    onClick={(e) => { e.stopPropagation(); onTerminate(agent.uuid || agent.id); }} 
                    className={getActionButtonClass(false, "", "hover:bg-red-500/20 text-red-500", false, showLabels)}
                >
                    <Trash2 size={12} className="shrink-0" />
                    {showLabels && <span className="truncate">Terminate</span>}
                </button>
            </Tooltip>
        </div>
    );
};