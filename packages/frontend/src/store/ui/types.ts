import type {
  FloatingPanelId,
  FloatingPanelPreference,
  L4RightPanel,
  SidebarSectionKey,
  UIPreferences,
} from '@/contexts/uiPreferences';

export interface UIStoreState {
  isDark: boolean;
  sidebarWidth: number;
  selectedAgentId: string | null;
  viewMode: 'detached' | 'attached';
  areTooltipsEnabled: boolean;
  uiPreferences: UIPreferences;
  sidebarSectionKeys: SidebarSectionKey[];
}

export interface UIStoreActions {
  setIsDark: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarWidth: (updater: number | ((prev: number) => number)) => void;
  setSelectedAgentId: (updater: string | null | ((prev: string | null) => string | null)) => void;
  setViewMode: (updater: 'detached' | 'attached' | ((prev: 'detached' | 'attached') => 'detached' | 'attached')) => void;
  setAreTooltipsEnabled: (updater: boolean | ((prev: boolean) => boolean)) => void;
  updateFloatingPanel: (panelId: FloatingPanelId, patch: Partial<FloatingPanelPreference>) => void;
  bringToFront: (panelId: FloatingPanelId) => void;
  updateUIPreferences: (patch: Partial<UIPreferences>) => void;
  updateQueuePreferences: (patch: Partial<UIPreferences['queue']>) => void;
  updateTacticalPreferences: (patch: Partial<UIPreferences['tactical']>) => void;
  updateTerminalPreferences: (patch: Partial<UIPreferences['terminal']>) => void;
  updateSidebarPreferences: (patch: Partial<UIPreferences['sidebar']>) => void;
  setL4RightPanel: (panel: L4RightPanel) => void;
  restoreDefaultPanels: () => void;
  restoreDefaultQueuePreferences: () => void;
  restoreDefaultTacticalPreferences: () => void;
  restoreDefaultTerminalPreferences: () => void;
  restoreDefaultSidebar: () => void;
  restoreDefaultL4Panel: () => void;
}

export type UIStore = UIStoreState & UIStoreActions;

