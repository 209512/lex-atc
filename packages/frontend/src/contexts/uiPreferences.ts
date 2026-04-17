import { LogDomain } from '@/contexts/atcTypes';

export type FloatingPanelId = 'queue' | 'tactical' | 'terminal' | 'l4';
export type SidebarSectionKey = 'overview' | 'l4' | 'ops' | 'agents';
export type L4RightPanel = 'summary' | 'legend';
export type QueuePanelTab = 'all' | 'priority' | 'traffic';
export type TacticalFilterMode = 'all' | 'priority';
export type TerminalDomainFilter = 'ALL' | LogDomain;

export interface FloatingPanelPreference {
  x: number;
  y: number;
  isOpen?: boolean;
  isCollapsed?: boolean;
  width?: number;
  height?: number;
}

export type ViewMode = 'executive' | 'operator' | 'focus';
export type ThemeType = 'dark' | 'light' | 'high-contrast';
export type FontSizeMode = 'small' | 'medium' | 'large';

export interface UIPreferences {
  panels: Record<FloatingPanelId, FloatingPanelPreference>;
  panelOrder: FloatingPanelId[];
  viewMode: ViewMode;
  theme: ThemeType;
  fontSizeMode: FontSizeMode;
  reduceMotion: boolean;
  limitFps: boolean;
  queue: {
    activeTab: QueuePanelTab;
  };
  tactical: {
    filterMode: TacticalFilterMode;
  };
  terminal: {
    filter: string;
    domainFilter: TerminalDomainFilter;
    actionKeyFilter: string;
    showOnlyEconomy: boolean;
    autoScroll: boolean;
  };
  sidebar: {
    sectionOrder: SidebarSectionKey[];
    sections: Record<SidebarSectionKey, boolean>;
  };
  l4: {
    rightPanel: L4RightPanel;
  };
}

export interface PersistedUIState {
  isDark: boolean;
  sidebarWidth: number;
  viewMode: 'detached' | 'attached';
  areTooltipsEnabled: boolean;
  preferences: UIPreferences;
}

export const createDefaultUIPreferences = (): UIPreferences => ({
  panels: {
    queue: { x: 20, y: 400, isOpen: true, isCollapsed: false, width: 360, height: 320 },
    tactical: {
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 340) : 480,
      y: 20,
      isOpen: true,
      isCollapsed: false,
      width: 320,
      height: 600
    },
    terminal: {
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 1000) : 20,
      y: 20,
      isCollapsed: false,
      width: 640,
      height: 360,
      isOpen: true
    },
    l4: { x: 20, y: 20, isOpen: true, width: 760, height: 320 },
  },
  panelOrder: ['l4', 'terminal', 'tactical', 'queue'],
  viewMode: 'operator',
  theme: 'dark',
  fontSizeMode: 'medium',
  reduceMotion: false,
  limitFps: false,
  queue: {
    activeTab: 'all',
  },
  tactical: {
    filterMode: 'all',
  },
  terminal: {
    filter: 'ALL',
    domainFilter: 'ALL',
    actionKeyFilter: 'ALL',
    showOnlyEconomy: false,
    autoScroll: true,
  },
  sidebar: {
    sectionOrder: ['overview', 'l4', 'ops', 'agents'],
    sections: {
      overview: true,
      l4: true,
      ops: true,
      agents: true,
    },
  },
  l4: {
    rightPanel: 'summary',
  },
});

export const UI_STORAGE_KEY = 'lex-atc.ui-state.v3';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadPersistedUIState = (): Partial<PersistedUIState> => {
  if (!isBrowser()) return {};

  try {
    // Migration: remove old v2 cache to free up space
    window.localStorage.removeItem('lex-atc.ui-state.v2');

    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
};

export const persistUIState = (value: PersistedUIState) => {
  if (!isBrowser()) return;

  try {
    const serialized = JSON.stringify(value);
    // Capacity management: If the state gets unusually large (>50KB), reset only heavy parts like terminal/tactical to defaults
    if (serialized.length > 50000) {
      console.warn('[UI_PREFS] State too large, clearing cache to prevent QuotaExceededError.');
      const lightweightState = {
        ...value,
        preferences: createDefaultUIPreferences()
      };
      window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(lightweightState));
      return;
    }
    window.localStorage.setItem(UI_STORAGE_KEY, serialized);
  } catch (e) {
    console.error('[UI_PREFS] Failed to persist state', e);
    // Clear storage if quota exceeded
    window.localStorage.removeItem(UI_STORAGE_KEY);
  }
};
