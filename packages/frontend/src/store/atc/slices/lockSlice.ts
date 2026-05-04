import type { StateCreator } from 'zustand';
import type { ATCStore } from '../types';
import { frontendConfig } from '@/config/runtime';

export type ATCLockSlice = Pick<
  ATCStore,
  'deletedIds' | 'fieldLocks' | 'stateLocks' | 'markAction' | 'clearDeletedAgent' | 'pruneLocks'
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
        newDeletedIds.set(originalId, Date.now() + frontendConfig.sse.fieldLockMs);
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

  pruneLocks: (nowArg) => {
    const now = typeof nowArg === 'number' ? nowArg : Date.now();
    set((prev) => {
      let deletedChanged = false;
      let fieldChanged = false;
      let stateChanged = false;

      let newDeletedIds = prev.deletedIds;
      for (const [id, exp] of prev.deletedIds) {
        if (exp <= now) {
          if (!deletedChanged) newDeletedIds = new Map(prev.deletedIds);
          deletedChanged = true;
          newDeletedIds.delete(id);
        }
      }

      let newStateLocks = prev.stateLocks;
      for (const [field, lock] of prev.stateLocks) {
        if (lock.expiry <= now) {
          if (!stateChanged) newStateLocks = new Map(prev.stateLocks);
          stateChanged = true;
          newStateLocks.delete(field);
        }
      }

      let newFieldLocks = prev.fieldLocks;
      for (const [agentId, locks] of prev.fieldLocks) {
        let agentChanged = false;
        let nextLocks = locks;
        for (const [field, lock] of locks) {
          if (lock.expiry <= now) {
            if (!agentChanged) nextLocks = new Map(locks);
            agentChanged = true;
            nextLocks.delete(field);
          }
        }
        if (agentChanged) {
          if (!fieldChanged) newFieldLocks = new Map(prev.fieldLocks);
          fieldChanged = true;
          if (nextLocks.size === 0) newFieldLocks.delete(agentId);
          else newFieldLocks.set(agentId, nextLocks);
        }
      }

      if (!deletedChanged && !fieldChanged && !stateChanged) return {};

      return {
        ...(deletedChanged ? { deletedIds: newDeletedIds } : {}),
        ...(fieldChanged ? { fieldLocks: newFieldLocks } : {}),
        ...(stateChanged ? { stateLocks: newStateLocks } : {}),
      } as any;
    });
  },
});
