import { create } from 'zustand';
import type { ATCStore } from './types';
import { createATCCoreSlice } from './slices/coreSlice';
import { createATCLockSlice } from './slices/lockSlice';
import { createATCActionsRegistrySlice } from './slices/actionsSlice';

export const useATCStore = create<ATCStore>()((...a) => ({
  ...createATCCoreSlice(...a),
  ...createATCLockSlice(...a),
  ...createATCActionsRegistrySlice(...a),
}));

