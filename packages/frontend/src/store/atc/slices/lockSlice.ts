import type { StateCreator } from 'zustand';
import type { ATCStore } from '../types';
import { frontendConfig } from '@/config/runtime';

export type ATCLockSlice = Pick<
  ATCStore,
  'deletedIds' | 'fieldLocks' | 'stateLocks' | 'markAction' | 'clearDeletedAgent'
>;

export const createATCLockSlice: StateCreator<ATCStore, [], [], ATCLockSlice> = (set, get) => ({
  deletedIds: new Map(),
  fieldLocks: new Map(),
  stateLocks: new Map(),

  markAction: (agentId, field, value, isDelete = false) => {
    set((prev) => {
      const originalId = String(agentId);
      const newDeletedIds = new Map(prev.deletedIds);
      const newFieldLocks = new Map(prev.fieldLocks);
      const newStateLocks = new Map(prev.stateLocks);

      if (isDelete) {
        newDeletedIds.set(originalId, Date.now() + 8000);
        newFieldLocks.delete(originalId);
        get().setState((s) => ({
          ...s,
          priorityAgents: (s.priorityAgents || []).filter((id) => id !== originalId),
        }));
      } else if (field) {
        if (!originalId) {
          newStateLocks.set(field, { value, expiry: Date.now() + frontendConfig.sse.fieldLockMs });
        } else {
          if (!newFieldLocks.has(originalId)) newFieldLocks.set(originalId, new Map());
          const agentLocks = new Map(newFieldLocks.get(originalId));
          agentLocks.set(field, { value, expiry: Date.now() + frontendConfig.sse.fieldLockMs });
          newFieldLocks.set(originalId, agentLocks);
        }
      }

      return {
        deletedIds: newDeletedIds,
        fieldLocks: newFieldLocks,
        stateLocks: newStateLocks,
      };
    });
  },

  clearDeletedAgent: (agentId) => {
    set((prev) => {
      const newDeletedIds = new Map(prev.deletedIds);
      newDeletedIds.delete(String(agentId));
      return { deletedIds: newDeletedIds };
    });
  },
});
