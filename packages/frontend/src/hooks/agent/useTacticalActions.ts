import { useShallow } from 'zustand/react/shallow';
// src/hooks/agent/useTacticalActions.ts
import { useState, useCallback } from 'react';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { Agent } from '@/contexts/atcTypes'; 

export const useTacticalActions = () => {
    const { 
        agents, state, togglePause, 
        renameAgent: submitRename,
        terminateAgent: apiTerminate, 
        togglePriority: apiTogglePriority, transferLock, 
        playClick, playAlert, toggleGlobalStop: apiToggleGlobalStop
    } = useATCStore(useShallow(s => ({
        agents: s.agents,
        state: s.state,
        togglePause: s.togglePause,
        renameAgent: s.renameAgent,
        terminateAgent: s.terminateAgent,
        togglePriority: s.togglePriority,
        transferLock: s.transferLock,
        playClick: s.playClick,
        playAlert: s.playAlert,
        toggleGlobalStop: s.toggleGlobalStop
    })));
    
    const { isDark, sidebarWidth, areTooltipsEnabled  } = useUIStore(useShallow(s => ({ isDark: s.isDark, sidebarWidth: s.sidebarWidth, areTooltipsEnabled: s.areTooltipsEnabled })));
    
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');

    const globalStop = !!state?.globalStop;

    const handleStartRename = useCallback((agentId: string) => {
        if (playClick) playClick();
        setRenamingId(agentId);
        const target = agents.find((a: Agent) => a.id === agentId);
        setNewName(target?.displayId || agentId);
    }, [agents, playClick]);

    const handleCancelRename = useCallback(() => {
        if (playClick) playClick();
        setRenamingId(null);
        setNewName('');
    }, [playClick]);

    const handleConfirmRename = useCallback(async (id: string) => {
        const trimmedName = newName.trim();
        const invalidPattern = /[^a-zA-Z0-9\-_.]/;

        if (invalidPattern.test(trimmedName)) {
            if (playAlert) playAlert();
            return;
        }

        const targetAgent = agents.find((a: Agent) => String(a.id) === String(id));
        if (!trimmedName || trimmedName === (targetAgent?.displayId || id)) {
            return handleCancelRename();
        }
        
        try {
            await submitRename(id, trimmedName);
            setRenamingId(null);
            setNewName('');
        } catch (_err) {
            if (playAlert) playAlert();
        }
    }, [newName, agents, submitRename, playAlert, handleCancelRename]);
        
    const togglePriority = useCallback((id: string, enable: boolean) => {
        apiTogglePriority(id, enable);
    }, [apiTogglePriority]);

    const onTogglePause = useCallback((agentId: string, currentPaused: boolean) => {
        togglePause(agentId, !currentPaused);
    }, [togglePause]);

    const handleTerminate = useCallback((id: string) => {
        apiTerminate(id);
    }, [apiTerminate]);

    const onTransferLock = useCallback((id: string) => {
        transferLock(id);
    }, [transferLock]);

    const handleToggleGlobalStop = useCallback(() => {
        apiToggleGlobalStop();
    }, [apiToggleGlobalStop]);

    return {
        agents, 
        state, 
        isDark, 
        sidebarWidth, 
        areTooltipsEnabled,
        renamingId, newName, setNewName, globalStop,
        handleStartRename, handleCancelRename, handleConfirmRename,
        toggleGlobalStop: handleToggleGlobalStop, 
        onTogglePause, 
        terminateAgent: handleTerminate, 
        togglePriority, 
        onTransferLock, 
        submitRename,
        playAlert 
    };
};
