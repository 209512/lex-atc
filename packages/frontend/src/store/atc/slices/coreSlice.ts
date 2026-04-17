import type { StateCreator } from 'zustand';
import type { LogEntry } from '@/contexts/atcTypes';
import type { ATCStore } from '../types';
import { createInitialATCState } from '../initialState';
import { atcApi } from '@/contexts/atcApi';
import { audioService } from '@/utils/audioService';

export type ATCCoreSlice = Pick<
  ATCStore,
  'state' | 'agents' | 'isAdminMuted' | 'setState' | 'setAgents' | 'setIsAdminMuted' | 'toggleAdminMute' | 'addLog' |
  'updateAgentConfig' | 'toggleGlobalStop' | 'togglePause' | 'togglePriority' | 'transferLock' | 'terminateAgent' |
  'setTrafficIntensity' | 'triggerOverride' | 'releaseLock' | 'playAlert' | 'playClick' | 'updatePriorityOrder' |
  'renameAgent' | 'submitRename'
>;

export const createATCCoreSlice: StateCreator<ATCStore, [], [], ATCCoreSlice> = (set, get) => ({
  state: createInitialATCState(),
  agents: [],
  isAdminMuted: false,

  setState: (updater) =>
    set((prev) => ({
      state: typeof updater === 'function' ? updater(prev.state) : updater,
    })),

  setAgents: (updater) =>
    set((prev) => {
      const nextAgents = typeof updater === 'function' ? updater(prev.agents) : updater;
      const isGlobalStop = prev.state.globalStop;

      const frozenAgents = nextAgents.map((newAgent) => {
        const isPaused = isGlobalStop || String(newAgent.status || '').toLowerCase() === 'paused';
        if (isPaused) {
          const prevAgent = prev.agents.find((a) => a.id === newAgent.id);
          if (prevAgent && prevAgent.position) {
            return { ...newAgent, position: prevAgent.position };
          }
        }
        return newAgent;
      });

      return { agents: frozenAgents };
    }),

  setIsAdminMuted: (muted) => set({ isAdminMuted: muted }),
  toggleAdminMute: () => set((prev) => ({ isAdminMuted: !prev.isAdminMuted })),

  addLog: (message, type = 'info', agentId = 'SYSTEM', meta = {}) => {
    const newLog: LogEntry = {
      id: `ui-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      message: message.toUpperCase(),
      timestamp: Date.now(),
      type,
      ...meta,
    };

    set((prev) => ({
      state: {
        ...prev.state,
        logs: [...(prev.state.logs || []), newLog].slice(-1000),
      },
    }));
  },

  playAlert: () => {
    if (!get().isAdminMuted) audioService.play(880, 'square', 0.15, 0.1);
  },
  playClick: () => {
    if (!get().isAdminMuted) audioService.play(660, 'sine', 0.05, 0.05);
  },

  setTrafficIntensity: (val: number) => {
    const state = get().state;
    const minRequired = state.priorityAgents?.length || 1;
    const finalValue = Math.max(minRequired, Math.floor(val));

    if (finalValue !== state.trafficIntensity) {
      get().playClick();
      const prevIntensity = state.trafficIntensity;
      get().setState((prev) => ({ ...prev, trafficIntensity: finalValue }));

      atcApi.scaleAgents(finalValue)
        .then((res) => {
          if (res.agents) {
            get().setAgents(res.agents);
            get().setState((prev) => ({ ...prev, trafficIntensity: res.agents.length }));
          } else {
            get().setState((prev) => ({ ...prev, trafficIntensity: finalValue }));
          }
        })
        .catch((err) => {
          get().playAlert();
          get().addLog(`SCALE_FAILED: ${err.message}`, 'error');
          get().setState((prev) => ({ ...prev, trafficIntensity: prevIntensity }));
        });
    }
  },

  togglePause: (uuid: string, paused: boolean) => {
    get().playClick();
    const nextStatus = paused ? 'paused' : 'active';
    get().markAction(uuid, 'status', nextStatus);
    get().setAgents((prev) =>
      prev.map((a) => (a.id === uuid ? { ...a, status: nextStatus as any, isPaused: paused } : a))
    );

    atcApi.togglePause(uuid, paused).catch((err) => {
      get().playAlert();
      get().addLog(`PAUSE_FAILED: ${err.message}`, 'error', uuid);
      get().markAction(uuid, 'status', null);
    });
    get().addLog(paused ? 'SUSPENDED' : 'RESUMED', 'system', uuid);
  },

  togglePriority: (uuid: string, priority: boolean) => {
    if (priority) {
      if (!get().isAdminMuted) audioService.play(1100, 'sine', 0.1, 0.05);
    } else {
      get().playClick();
    }
    get().markAction(uuid, 'priority', priority);
    get().setAgents((prev) => prev.map((a) => (a.id === uuid ? { ...a, priority } : a)));

    get().addLog(priority ? 'PRIORITY_SET' : 'PRIORITY_REMOVED', priority ? 'warn' : 'info', uuid);
    atcApi.togglePriority(uuid, priority).catch((err) => {
      get().playAlert();
      get().addLog(`PRIORITY_FAILED: ${err.message}`, 'error', uuid);
      get().markAction(uuid, 'priority', !priority);
    });
  },

  terminateAgent: (uuid: string) => {
    const agents = get().agents;
    if (agents.length <= 1) {
      get().playAlert();
      get().addLog(`TERMINATION DENIED: MINIMUM 1 AGENT REQUIRED`, 'error');
      return;
    }
    get().playClick();
    get().markAction(uuid, '', null, true);

    const prevAgents = [...agents];
    get().setAgents((prev) => prev.filter((a) => a.id !== uuid));
    get().addLog(`TERMINATING`, 'error', uuid);

    atcApi.terminateAgent(uuid)
      .then(() => {
        get().setState((prev) => ({ ...prev, trafficIntensity: prevAgents.length - 1 }));
      })
      .catch((err) => {
        get().playAlert();
        get().addLog(`TERMINATE_FAILED: ${err.message}`, 'error', uuid);
        get().setAgents(prevAgents);
      });
  },

  transferLock: (uuid: string) => {
    get().playAlert();
    get().markAction(uuid, 'forcedCandidate', uuid);
    get().setState((prev) => ({ ...prev, forcedCandidate: uuid }));
    get().addLog(`FORCE_TRANSFER_INITIATED`, 'system', uuid);

    atcApi.transferLock(uuid).catch((err) => {
      get().addLog(`TRANSFER_FAILED: ${err.message}`, 'error', uuid);
      get().setState((prev) => ({ ...prev, forcedCandidate: null }));
    });
  },

  toggleGlobalStop: () => {
    get().playAlert();
    const state = get().state;
    const nextStop = !state.globalStop;
    get().markAction('', 'globalStop', nextStop);
    get().setState((prev) => ({ ...prev, globalStop: nextStop }));
    get().addLog(nextStop ? 'GLOBAL_STOP_ENGAGED' : 'SYSTEM_RELEASED', 'system');

    atcApi.toggleGlobalStop(nextStop).catch((err) => {
      get().addLog(`GLOBAL_STOP_FAILED: ${err.message}`, 'error');
      get().setState((prev) => ({ ...prev, globalStop: !nextStop }));
    });
  },

  triggerOverride: async () => {
    get().playAlert();
    get().markAction('', 'overrideSignal', true);
    get().setState((prev) => ({ ...prev, overrideSignal: true, holder: 'Human-Operator' }));
    get().addLog('EMERGENCY OVERRIDE', 'critical');

    return atcApi.triggerOverride().catch((err) => {
      get().addLog(`OVERRIDE_FAILED: ${err.message}`, 'error');
      get().setState((prev) => ({ ...prev, overrideSignal: false, holder: null }));
    });
  },

  releaseLock: async () => {
    if (!get().isAdminMuted) audioService.play(1100, 'sine', 0.1, 0.05);
    get().markAction('', 'overrideSignal', false);
    get().setState((prev) => ({ ...prev, overrideSignal: false, holder: null }));
    get().addLog('OVERRIDE RELEASED', 'info');

    return atcApi.releaseLock().catch((err) => {
      get().addLog(`RELEASE_FAILED: ${err.message}`, 'error');
      get().setState((prev) => ({ ...prev, overrideSignal: true, holder: 'Human-Operator' }));
    });
  },

  updateAgentConfig: (uuid: string, config: any) => {
    get().setAgents((prev) => prev.map((a) => (a.id === uuid ? { ...a, ...config } : a)));
    get().addLog(`CONFIG_UPDATED`, 'success', uuid);

    atcApi.updateConfig(uuid, config).catch((err) =>
      get().addLog(`CONFIG_FAILED: ${err.message}`, 'error', uuid)
    );
  },

  updatePriorityOrder: (newOrder: string[]) => {
    get().markAction('', 'priorityAgents', newOrder);
    get().setState((prev) => ({ ...prev, priorityAgents: newOrder }));
    atcApi.updatePriorityOrder(newOrder).catch((err) => get().addLog(`ORDER_FAILED: ${err.message}`, 'error'));
  },

  renameAgent: async (uuid: string, newName: string) => {
    if (!newName) return;
    get().markAction(uuid, 'rename', newName);
    try {
      await atcApi.renameAgent(uuid, newName);
      if (!get().isAdminMuted) audioService.play(1100, 'sine', 0.1, 0.05);
    } catch (err: any) {
      get().playAlert();
      get().addLog(`RENAME_FAILED: ${err.message}`, 'error', uuid);
      get().markAction(uuid, 'rename', null);
      throw err;
    }
  },

  submitRename: async (uuid: string, newName: string) => {
    if (!newName) return;
    get().markAction(uuid, 'rename', newName);
    try {
      await atcApi.renameAgent(uuid, newName);
      if (!get().isAdminMuted) audioService.play(1100, 'sine', 0.1, 0.05);
    } catch (_err: any) {
      get().playAlert();
      get().markAction(uuid, 'rename', null);
    }
  },
});
