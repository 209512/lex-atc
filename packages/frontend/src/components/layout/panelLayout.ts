export const PANEL_LAYOUT = {
  queue: {
    left: 16,
    top: 540,
    widthClass: 'w-[280px] sm:w-[320px]',
    openHeightClass: 'h-[420px]',
  },
  terminal: {
    left: 16,
    expandedWidthClass: 'w-[600px]',
    collapsedWidthClass: '!w-80',
    expandedHeightClass: 'h-[360px]',
  },
  tactical: {
    top: 100,
    widthClass: 'w-[280px] sm:w-[320px]',
    rightOffset: 16,
    maxHeightClass: 'max-h-[48vh]',
  },
} as const;

export const getTacticalPanelRight = (sidebarWidth: number) => {
  const safeSidebarWidth = Number.isFinite(sidebarWidth) ? sidebarWidth : 280;
  return safeSidebarWidth + PANEL_LAYOUT.tactical.rightOffset;
};

