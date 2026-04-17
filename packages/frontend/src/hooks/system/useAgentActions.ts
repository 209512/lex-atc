import { useCallback } from 'react';
import { atcApi } from '@/contexts/atcApi';
import { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { matchesAgentIdentity } from '@/utils/agentIdentity';

interface UseAgentActionsProps {
    agents: any[];
    setAgents: React.Dispatch<React.SetStateAction<any[]>>;
    setState: React.Dispatch<React.SetStateAction<any>>;
    addLog: (message: string, type?: string, agentId?: string, metadata?: any) => void;
    markAction: (uuid: string, action: string, value: any, isDelete?: boolean) => void;
    clearDeletedAgent: (uuid: string) => void;
    playClick: () => void;
    playAlert: () => void;
    playSuccess: () => void;
}

export const useAgentActions = ({
    agents,
    setAgents,
    setState,
    addLog,
    markAction,
    clearDeletedAgent,
    playClick,
    playAlert,
    playSuccess
}: UseAgentActionsProps) => {

    const resolveAgentUuid = useCallback((ref: string) => {
        const target = agents.find((agent) => matchesAgentIdentity(agent, ref));
        return target?.uuid || ref;
    }, [agents]);

    const resolveAgentLabel = useCallback((ref: string) => {
        const target = agents.find((agent) => matchesAgentIdentity(agent, ref));
        return target?.displayId || target?.id || ref;
    }, [agents]);

    const togglePause = useCallback((ref: string, paused: boolean) => {
        const uuid = resolveAgentUuid(ref);
        playClick();
        const nextStatus = paused ? 'PAUSED' : 'ACTIVE';
        addLog(paused ? 'PAUSE_REQUESTED' : 'RESUME_REQUESTED', 'info', uuid, { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: paused ? LOG_ACTIONS.PAUSE_AGENT : LOG_ACTIONS.RESUME_AGENT });
        markAction(uuid, 'status', nextStatus);
        setAgents(prev => prev.map(a => 
            (a.uuid === uuid || a.id === uuid) 
                ? { ...a, status: nextStatus as any, isPaused: paused } 
                : a
        ));
        
        atcApi.togglePause(uuid, paused).catch(err => {
            playAlert();
            addLog(`PAUSE_FAILED: ${err.message}`, 'error', uuid, { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: paused ? LOG_ACTIONS.PAUSE_AGENT : LOG_ACTIONS.RESUME_AGENT });
            markAction(uuid, 'status', null);
        });
    }, [setAgents, addLog, markAction, playClick, playAlert, resolveAgentUuid]);

    const togglePriority = useCallback((ref: string, priority: boolean) => {
        const uuid = resolveAgentUuid(ref);
        priority ? playSuccess() : playClick();
        addLog(priority ? 'PRIORITY_GRANT_REQUESTED' : 'PRIORITY_REVOKE_REQUESTED', 'info', uuid, { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TOGGLE_PRIORITY });
        markAction(uuid, 'priority', priority);
        setAgents(prev => prev.map(a => 
            (a.uuid === uuid || a.id === uuid) ? { ...a, priority } : a
        ));
        
        atcApi.togglePriority(uuid, priority).catch(err => {
            playAlert();
            addLog(`PRIORITY_FAILED: ${err.message}`, 'error', uuid, { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TOGGLE_PRIORITY });
            markAction(uuid, 'priority', !priority);
        });
    }, [setAgents, markAction, addLog, playClick, playSuccess, playAlert, resolveAgentUuid]);

    const terminateAgent = useCallback((ref: string) => {
        const uuid = resolveAgentUuid(ref);
        playClick();
        addLog('TERMINATE_REQUESTED', 'info', uuid, { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
        markAction(uuid, '', null, true);
        
        const prevAgents = [...agents];
        setAgents(prev => prev.filter(a => !matchesAgentIdentity(a, uuid)));
        setState((prev: any) => ({
            ...prev,
            activeAgentCount: Math.max(0, Number(prev.activeAgentCount || prevAgents.length) - 1),
            trafficIntensity: Math.max(0, Number(prev.trafficIntensity || prevAgents.length) - 1),
            priorityAgents: (prev.priorityAgents || []).filter((id: string) => id !== uuid)
        }));
        
        atcApi.terminateAgent(uuid)
            .then(() => {
                markAction('', 'trafficIntensity', agents.length - 1);
                setState((prev: any) => ({ ...prev, trafficIntensity: agents.length - 1 }));
            })
            .catch(err => {
                playAlert();
                addLog(`TERMINATE_FAILED: ${err.message}`, 'error', uuid, { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TERMINATE_AGENT });
                clearDeletedAgent(uuid);
                setAgents(prevAgents);
                setState((prev: any) => ({ ...prev, activeAgentCount: prevAgents.length, trafficIntensity: prevAgents.length }));
            });
    }, [agents, setAgents, setState, addLog, markAction, clearDeletedAgent, playClick, playAlert, resolveAgentUuid]);

    const transferLock = useCallback((ref: string) => {
        const uuid = resolveAgentUuid(ref);
        const label = resolveAgentLabel(ref);
        playAlert();
        addLog(`LOCK_TRANSFER_REQUESTED ${label}`, 'info', uuid, { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
        markAction(uuid, 'forcedCandidate', uuid);
        setState((prev: any) => ({ ...prev, forcedCandidate: uuid }));
        
        atcApi.transferLock(uuid)
            .then((result: any) => {
                if (result?.success === false || result?.executed?.success === false) {
                    throw new Error(String(result?.error || result?.executed?.error || 'TRANSFER_FAILED'));
                }
                if (result?.scheduled && !result?.autoExecuted) {
                    addLog(`⚡ LOCK TRANSFER PROPOSAL CREATED FOR ${label}`, 'policy', 'SYSTEM', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.GOVERNANCE, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
                }
            })
            .catch(err => {
                addLog(`TRANSFER_FAILED: ${err.message}`, 'error', uuid, { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
                setState((prev: any) => ({ ...prev, forcedCandidate: null }));
            });
    }, [setState, addLog, markAction, playAlert, resolveAgentUuid, resolveAgentLabel]);

    const updateAgentConfig = useCallback((ref: string, config: any) => {
        const uuid = resolveAgentUuid(ref);
        setAgents(prev => prev.map(a => matchesAgentIdentity(a, uuid) ? { ...a, ...config } : a));
        
        atcApi.updateConfig(uuid, config).catch(err => 
            addLog(`CONFIG_FAILED: ${err.message}`, 'error', uuid)
        );
    }, [setAgents, addLog, resolveAgentUuid]);

    const renameAgent = useCallback(async (ref: string, newName: string) => {
        if (!newName) return;
        const uuid = resolveAgentUuid(ref);
        markAction(uuid, 'rename', newName);
        try {
            await atcApi.renameAgent(uuid, newName);
            playSuccess();
        } catch (err: any) {
            playAlert();
            addLog(`RENAME_FAILED: ${err.message}`, 'error', uuid);
            markAction(uuid, 'rename', null);
            throw err;
        }
    }, [resolveAgentUuid, markAction, playSuccess, playAlert, addLog]);

    const submitRename = useCallback(async (ref: string, newName: string) => {
        if (!newName) return;
        const uuid = resolveAgentUuid(ref);
        markAction(uuid, 'rename', newName);
        try {
            await atcApi.renameAgent(uuid, newName);
            playSuccess();
        } catch {
            playAlert();
            markAction(uuid, 'rename', null);
        }
    }, [resolveAgentUuid, markAction, playSuccess, playAlert]);

    return {
        resolveAgentUuid,
        resolveAgentLabel,
        togglePause,
        togglePriority,
        terminateAgent,
        transferLock,
        updateAgentConfig,
        renameAgent,
        submitRename
    };
};