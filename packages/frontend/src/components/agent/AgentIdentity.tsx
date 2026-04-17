// src/components/agent/AgentIdentity.tsx
import { useShallow } from 'zustand/react/shallow';
import React, { useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useATCStore } from '@/store/atc';
import { useAgentLogic } from '@/hooks/agent/useAgentLogic';
import { getAgentTextStyle } from '@/utils/agentStyles';
import { RenameButton } from '@/components/common/AgentActionButtons';
import { Agent, ATCState } from '@/contexts/atcTypes';

interface AgentIdentityProps {
    agent: Agent;
    state: ATCState;
    isDark: boolean;
    isRenaming: boolean;
    newName: string;
    setNewName: (name: string) => void;
    onStartRename: () => void;
    onConfirm: (id: string) => void;
    onCancel: () => void;
    showRenameButton?: boolean;
}

export const AgentIdentity = ({
    agent, state, isDark, isRenaming, newName, setNewName,
    onStartRename, onConfirm, onCancel, showRenameButton = true
}: AgentIdentityProps) => {
    const { playAlert, agents, renameAgent  } = useATCStore(useShallow(s => ({ playAlert: s.actions.playAlert, agents: s.agents, renameAgent: s.actions.renameAgent }))); 
    const { isLocked, isForced, isOverride } = useAgentLogic(agent, state);
    const [isShaking, setIsShaking] = useState(false);

    const triggerError = useCallback(() => {
        setIsShaking(true);
        if (playAlert) playAlert();
        setTimeout(() => setIsShaking(false), 400);
    }, [playAlert]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase(); 
        if (val === '' || /^[A-Z0-9\-_.]*$/.test(val)) {
            setNewName(val);
        } else {
            triggerError();
        }
    };

    const handleConfirm = async () => {
        const trimmedName = newName.trim();
        if (!trimmedName || trimmedName === (agent.displayId || agent.id)) {
            onCancel();
            return;
        }
        const isDuplicate = agents?.some((a: Agent) => 
            a.id !== agent.id && (a.displayId === trimmedName || a.id === trimmedName)
        );
        if (isDuplicate) {
            triggerError();
            return;
        }
        try {
            await renameAgent(agent.id, trimmedName);
            onConfirm(agent.id);
        } catch (_err) {
            triggerError();
        }
    };

    const textStyle = getAgentTextStyle({
        isForced, 
        isLocked, 
        isDark, 
        overrideSignal: isOverride
    });

    return (
        <div className="flex items-center gap-2 min-w-0 flex-1 h-6 relative group/id-wrapper overflow-hidden">
            <AnimatePresence mode="wait">
                {isRenaming ? (
                    <motion.div 
                        key="rename-input"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1, x: isShaking ? [-4, 4, -4, 4, 0] : 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex items-center gap-1 flex-1 min-w-0 z-20"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="relative flex items-center flex-1 min-w-0">
                            <input 
                                autoFocus 
                                placeholder="CALLSIGN..."
                                value={newName} 
                                onChange={handleNameChange}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleConfirm();
                                    if (e.key === 'Escape') onCancel();
                                }}
                                className={clsx(
                                    "text-[10px] pl-2 pr-2 py-1 rounded-sm w-full outline-none font-mono border transition-all text-left uppercase whitespace-nowrap overflow-hidden",
                                    isDark 
                                        ? "bg-black border-blue-500/50 text-blue-400" 
                                        : "bg-white border-blue-400 text-slate-900",
                                    isShaking && "border-red-500 ring-1 ring-red-500 text-red-500"
                                )}
                            />

                            <span className="absolute right-2 text-[8px] opacity-40 font-mono pointer-events-none tracking-tighter hidden lg:inline">
                                A-Z 0-9 -_.
                            </span>
                        </div>
                        <div className="flex items-center shrink-0">
                            <button onClick={handleConfirm} className="text-emerald-500 hover:text-emerald-400 p-0.5">
                                <Check size={15}/>
                            </button>
                            <button onClick={onCancel} className="text-gray-500 hover:text-red-400 p-0.5">
                                <X size={13}/>
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="display-name"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 truncate flex-1 min-w-0"
                    >
                        <span className={clsx(
                            textStyle, 
                            "truncate font-bold text-[13px] tracking-tight uppercase whitespace-nowrap",
                            isLocked && "underline decoration-emerald-500/30 underline-offset-4"
                        )}>
                            {agent.displayId || agent.id}
                        </span>
                        {showRenameButton && (
                            <RenameButton 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    onStartRename(); 
                                }} 
                                className="opacity-0 group-hover/id-wrapper:opacity-100 transition-opacity shrink-0"
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
