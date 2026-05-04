import React from 'react';
import clsx from 'clsx';
import { Agent } from '@/contexts/atcTypes';
import { getAgentLabel } from '@/utils/agentIdentity';

export const RadarLiteHud = ({
  isDark,
  holderLabel,
  agentsCount,
  selectedAgent,
}: {
  isDark: boolean;
  holderLabel: string;
  agentsCount: number;
  selectedAgent: Agent | null;
}) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-hud pointer-events-none">
      <div
        className={clsx(
          'px-6 py-2 rounded-full border backdrop-blur-md transition-colors shadow-lg flex flex-col items-center gap-1',
          isDark ? 'bg-black/60 border-gray-800 text-gray-300' : 'bg-white/80 border-slate-200 text-slate-700'
        )}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">HOLDER</span>
            <span className={clsx('text-xs font-mono font-bold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{holderLabel}</span>
          </div>
          <div className="w-px h-4 bg-gray-500/30"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">SYSTEM</span>
            <span className="text-xs font-mono font-bold">{agentsCount} AGENTS</span>
          </div>
          <div className="w-px h-4 bg-gray-500/30"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">FOCUS</span>
            <span className={clsx('text-xs font-mono font-bold', isDark ? 'text-blue-400' : 'text-blue-600')}>
              {selectedAgent ? `SEL ${getAgentLabel(selectedAgent)}` : 'NONE'}
            </span>
          </div>
        </div>
        <div className="text-[8px] font-mono opacity-40 uppercase tracking-[0.2em] flex gap-3">
          <span>[L-Click] Focus</span>
          <span>[Drag] Rotate</span>
          <span>[Scroll] Zoom</span>
        </div>
      </div>
    </div>
  );
};

