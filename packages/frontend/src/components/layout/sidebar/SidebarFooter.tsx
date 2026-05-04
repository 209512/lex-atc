import React from 'react';
import clsx from 'clsx';

const formatUptime = (sec: number) => {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

interface SidebarFooterProps {
  isDark: boolean;
  uptime: number;
  onCollapseToRail: () => void;
}

export const SidebarFooter = ({ isDark, uptime, onCollapseToRail }: SidebarFooterProps) => (
  <div className={clsx(
    "p-3 border-t text-[10px] font-mono flex justify-between items-center gap-4 min-w-0 shrink-0",
    isDark ? "border-gray-800 bg-[#0b0e14] text-gray-600" : "border-slate-200 bg-white text-slate-400"
  )}>
    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        SYSTEM_READY
      </span>
      <span className="opacity-50 select-none text-[8px] truncate hidden sm:inline">v2.4.0-RC</span>
    </div>
    <div className="shrink-0 flex items-center gap-2">
      <button aria-label="HUD rail로 축소" onClick={onCollapseToRail} className="hover:text-gray-300">
        ◁
      </button>
      <span className="tabular-nums font-bold">UPTIME: {formatUptime(uptime)}</span>
    </div>
  </div>
);

