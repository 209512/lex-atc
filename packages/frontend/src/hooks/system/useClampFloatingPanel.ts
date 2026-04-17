import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/store/ui';
import { FloatingPanelId } from '@/contexts/uiPreferences';

export const useClampFloatingPanel = (
  panelId: FloatingPanelId,
  { width, height }: { width: number; height: number }
) => {
  const { sidebarWidth, uiPreferences, updateFloatingPanel } = useUIStore(useShallow((s) => ({
    sidebarWidth: s.sidebarWidth,
    uiPreferences: s.uiPreferences,
    updateFloatingPanel: s.updateFloatingPanel
  })));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const panel = uiPreferences.panels?.[panelId];
    if (!panel) return;

    const panelWidth = Number(panel.width ?? width);
    const panelHeight = Number(panel.height ?? height);
    if (!Number.isFinite(panelWidth) || !Number.isFinite(panelHeight) || panelWidth <= 0 || panelHeight <= 0) return;

    const maxX = Math.max(0, window.innerWidth - Number(sidebarWidth || 0) - panelWidth);
    const maxY = Math.max(0, window.innerHeight - panelHeight);

    const nextX = Math.min(Math.max(Number(panel.x || 0), 0), maxX);
    const nextY = Math.min(Math.max(Number(panel.y || 0), 0), maxY);

    if (nextX !== panel.x || nextY !== panel.y) {
      updateFloatingPanel(panelId, { x: nextX, y: nextY });
    }
  }, [panelId, sidebarWidth, uiPreferences, updateFloatingPanel, width, height]);
};

