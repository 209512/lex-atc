import { useCallback } from 'react';
import { atcApi } from '@/contexts/atcApi';
import { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { useATCStore } from '@/store/atc';

interface UseSystemActionsProps {
    setState: React.Dispatch<React.SetStateAction<any>>;
    addLog: (message: string, type?: string, agentId?: string, metadata?: any) => void;
    markAction: (uuid: string, action: string, value: any, isDelete?: boolean) => void;
    playClick: () => void;
    playAlert: () => void;
    playSuccess: () => void;
}

export const useSystemActions = ({
    setState,
    addLog,
    markAction,
    playClick,
    playAlert,
    playSuccess
}: UseSystemActionsProps) => {

    const setTrafficIntensity = useCallback((val: number) => {
        const currentState = useATCStore.getState().state;
        const minRequired = (currentState.priorityAgents?.length || 0) > 0 ? (currentState.priorityAgents?.length || 0) : 0;
        const finalValue = Math.max(minRequired, Math.floor(val));
        
        if (finalValue !== currentState.trafficIntensity) {
            playClick();
            const prevIntensity = currentState.trafficIntensity;
            addLog(`SCALE_REQUESTED: ${finalValue}`, 'info', 'SYSTEM', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.SCALE_AGENTS });
            markAction('', 'trafficIntensity', finalValue);
            setState((prev: any) => ({ ...prev, trafficIntensity: finalValue }));
            
            atcApi.scaleAgents(finalValue)
                .then((result: any) => {
                    if (result?.success === false || result?.executed?.success === false) {
                        throw new Error(String(result?.error || result?.executed?.error || 'SCALE_FAILED'));
                    }
                    if (result?.scheduled && !result?.autoExecuted) {
                        addLog(`⚡ SCALE PROPOSAL CREATED TO ${finalValue}`, 'policy', 'SYSTEM', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.GOVERNANCE, actionKey: LOG_ACTIONS.SCALE_AGENTS });
                        markAction('', 'trafficIntensity', prevIntensity);
                        setState((prev: any) => ({ ...prev, trafficIntensity: prevIntensity }));
                    }
                })
                .catch(err => {
                    playAlert();
                    addLog(`SCALE_FAILED: ${err.message}`, 'error', 'SYSTEM', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.SCALE_AGENTS });
                    markAction('', 'trafficIntensity', prevIntensity);
                    setState((prev: any) => ({ ...prev, trafficIntensity: prevIntensity }));
                });
        }
    }, [setState, playClick, playAlert, addLog, markAction]);

    const toggleGlobalStop = useCallback(() => {
        playAlert();
        const currentState = useATCStore.getState().state;
        const nextStop = !currentState.globalStop;
        addLog(nextStop ? 'GLOBAL_STOP_REQUESTED' : 'GLOBAL_RESUME_REQUESTED', 'info', 'SYSTEM', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
        markAction('', 'globalStop', nextStop);
        setState((prev: any) => ({ ...prev, globalStop: nextStop }));
        
        atcApi.toggleGlobalStop(nextStop).catch(err => {
            addLog(`GLOBAL_STOP_FAILED: ${err.message}`, 'error', 'SYSTEM', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
            setState((prev: any) => ({ ...prev, globalStop: !nextStop }));
        });
    }, [setState, markAction, addLog, playAlert]);

    const triggerOverride = useCallback(async () => {
        playAlert();
        addLog('OVERRIDE_REQUESTED', 'info', 'SYSTEM', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.OVERRIDE });
        markAction('', 'overrideSignal', true);
        setState((prev: any) => ({ ...prev, overrideSignal: true, holder: 'Human-Operator' }));
        
        return atcApi.triggerOverride().catch(err => {
            addLog(`OVERRIDE_FAILED: ${err.message}`, 'error', 'SYSTEM', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.OVERRIDE });
            setState((prev: any) => ({ ...prev, overrideSignal: false, holder: null }));
        });
    }, [playAlert, markAction, setState, addLog]);

    const releaseLock = useCallback(async () => {
        playSuccess();
        addLog('RELEASE_REQUESTED', 'info', 'SYSTEM', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.RELEASE });
        markAction('', 'overrideSignal', false);
        setState((prev: any) => ({ ...prev, overrideSignal: false, holder: null }));
        
        return atcApi.releaseLock().catch(err => {
            addLog(`RELEASE_FAILED: ${err.message}`, 'error', 'SYSTEM', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.RELEASE });
            setState((prev: any) => ({ ...prev, overrideSignal: true, holder: 'Human-Operator' }));
        });
    }, [playSuccess, markAction, setState, addLog]);

    const updatePriorityOrder = useCallback((newOrder: string[]) => {
        markAction('', 'priorityAgents', newOrder);
        setState((prev: any) => ({ ...prev, priorityAgents: newOrder }));
        atcApi.updatePriorityOrder(newOrder).catch(err => addLog(`ORDER_FAILED: ${err.message}`, 'error'));
    }, [markAction, setState, addLog]);

    return {
        setTrafficIntensity,
        toggleGlobalStop,
        triggerOverride,
        releaseLock,
        updatePriorityOrder
    };
};