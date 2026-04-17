import type { StateCreator } from 'zustand';
import type { UIStore } from '../types';
import { createDefaultUIPreferences } from '@/contexts/uiPreferences';

export type UIBaseSlice = Pick<
  UIStore,
  | 'isDark'
  | 'sidebarWidth'
  | 'selectedAgentId'
  | 'viewMode'
  | 'areTooltipsEnabled'
  | 'uiPreferences'
  | 'sidebarSectionKeys'
  | 'setIsDark'
  | 'setSidebarWidth'
  | 'setSelectedAgentId'
  | 'setViewMode'
  | 'setAreTooltipsEnabled'
>;

const defaultPreferences = createDefaultUIPreferences();

export const createUIBaseSlice: StateCreator<UIStore, [['zustand/persist', unknown]], [], UIBaseSlice> = (set) => ({
  isDark: true,
  sidebarWidth: 450,
  selectedAgentId: null,
  viewMode: 'detached',
  areTooltipsEnabled: true,
  uiPreferences: {
    ...defaultPreferences,
    theme: 'dark',
    fontSizeMode: 'medium',
    reduceMotion: false,
    limitFps: false,
  },
  sidebarSectionKeys: ['overview', 'l4', 'ops', 'agents'],

  setIsDark: (updater) =>
    set((state) => ({ isDark: typeof updater === 'function' ? updater(state.isDark) : updater })),
  setSidebarWidth: (updater) =>
    set((state) => ({ sidebarWidth: typeof updater === 'function' ? updater(state.sidebarWidth) : updater })),
  setSelectedAgentId: (updater) =>
    set((state) => ({
      selectedAgentId: typeof updater === 'function' ? updater(state.selectedAgentId) : updater,
    })),
  setViewMode: (updater) =>
    set((state) => ({ viewMode: typeof updater === 'function' ? updater(state.viewMode) : updater })),
  setAreTooltipsEnabled: (updater) =>
    set((state) => ({ areTooltipsEnabled: typeof updater === 'function' ? updater(state.areTooltipsEnabled) : updater })),
});

