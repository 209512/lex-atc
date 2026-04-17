import type { StateCreator } from 'zustand';
import type { ATCStore } from '../types';
import { useATCStore } from '../store';

export type ATCActionsRegistrySlice = Pick<ATCStore, 'actions' | 'setActions'>;

export const createATCActionsRegistrySlice: StateCreator<ATCStore, [], [], ATCActionsRegistrySlice> = (set) => ({
  actions: {},
  setActions: (actions) => set({ actions }),
});

export const setupStoreActions = () => {
    const store = useATCStore.getState();
    store.setActions(store);
};

