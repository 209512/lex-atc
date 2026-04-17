import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIStore } from './types';
import { createUIBaseSlice } from './slices/baseSlice';
import { createUIPreferencesSlice } from './slices/preferencesSlice';

export const useUIStore = create<UIStore>()(
  persist(
    (...a) => ({
      ...createUIBaseSlice(...a),
      ...createUIPreferencesSlice(...a),
    }),
    {
      name: 'lex-atc.ui-state.v3',
      partialize: (state) => ({
        isDark: state.isDark,
        sidebarWidth: state.sidebarWidth,
        viewMode: state.viewMode,
        areTooltipsEnabled: state.areTooltipsEnabled,
        uiPreferences: state.uiPreferences,
      }),
    }
  )
);

