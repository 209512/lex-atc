import type { StateCreator } from 'zustand';
import type { UIStore } from '../types';
import { createDefaultUIPreferences } from '@/contexts/uiPreferences';

export type UIPreferencesSlice = Pick<
  UIStore,
  | 'updateFloatingPanel'
  | 'bringToFront'
  | 'updateUIPreferences'
  | 'updateQueuePreferences'
  | 'updateTacticalPreferences'
  | 'updateTerminalPreferences'
  | 'updateSidebarPreferences'
  | 'setL4RightPanel'
  | 'restoreDefaultPanels'
  | 'restoreDefaultQueuePreferences'
  | 'restoreDefaultTacticalPreferences'
  | 'restoreDefaultTerminalPreferences'
  | 'restoreDefaultSidebar'
  | 'restoreDefaultL4Panel'
>;

const defaultPreferences = createDefaultUIPreferences();

export const createUIPreferencesSlice: StateCreator<UIStore, [['zustand/persist', unknown]], [], UIPreferencesSlice> = (
  set
) => ({
  updateFloatingPanel: (panelId, patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        panels: {
          ...state.uiPreferences.panels,
          [panelId]: {
            ...state.uiPreferences.panels[panelId],
            ...patch,
          },
        },
      },
    })),

  bringToFront: (panelId) =>
    set((state) => {
      const currentOrder = state.uiPreferences.panelOrder || [];
      const newOrder = currentOrder.filter((id) => id !== panelId);
      newOrder.push(panelId);
      return {
        uiPreferences: {
          ...state.uiPreferences,
          panelOrder: newOrder,
        },
      };
    }),

  updateUIPreferences: (patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        ...patch,
      },
    })),

  updateQueuePreferences: (patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        queue: {
          ...state.uiPreferences.queue,
          ...patch,
        },
      },
    })),

  updateTacticalPreferences: (patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        tactical: {
          ...state.uiPreferences.tactical,
          ...patch,
        },
      },
    })),

  updateTerminalPreferences: (patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        terminal: {
          ...state.uiPreferences.terminal,
          ...patch,
        },
      },
    })),

  updateSidebarPreferences: (patch) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        sidebar: {
          ...state.uiPreferences.sidebar,
          ...patch,
          sections: {
            ...state.uiPreferences.sidebar.sections,
            ...(patch.sections || {}),
          },
        },
      },
    })),

  setL4RightPanel: (panel) =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        l4: {
          ...state.uiPreferences.l4,
          rightPanel: panel,
        },
      },
    })),

  restoreDefaultPanels: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        panels: defaultPreferences.panels,
      },
    })),

  restoreDefaultQueuePreferences: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        queue: defaultPreferences.queue,
      },
    })),

  restoreDefaultTacticalPreferences: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        tactical: defaultPreferences.tactical,
      },
    })),

  restoreDefaultTerminalPreferences: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        panels: {
          ...state.uiPreferences.panels,
          terminal: {
            ...defaultPreferences.panels.terminal,
            x: state.uiPreferences.panels.terminal.x,
            y: state.uiPreferences.panels.terminal.y,
          },
        },
        terminal: defaultPreferences.terminal,
      },
    })),

  restoreDefaultSidebar: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        sidebar: defaultPreferences.sidebar,
      },
    })),

  restoreDefaultL4Panel: () =>
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        l4: defaultPreferences.l4,
      },
    })),
});

