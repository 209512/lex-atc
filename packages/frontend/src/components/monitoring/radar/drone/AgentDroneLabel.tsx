import React from 'react';
import { Html } from '@react-three/drei';
import { Star, Pause } from 'lucide-react';
import clsx from 'clsx';

interface AgentDroneLabelProps {
  displayId: string;
  isDark: boolean;
  isLocked: boolean;
  isSelected: boolean;
  isPaused: boolean;
  isPriority: boolean;
  isOverride: boolean;
}

export const AgentDroneLabel = ({ displayId, isDark, isLocked, isSelected, isPaused, isPriority, isOverride }: AgentDroneLabelProps) => (
  <Html position={[0, 0.9, 0]} center distanceFactor={12} zIndexRange={[0, 10]} style={{ pointerEvents: 'none' }}>
    <div
      data-testid="agent-drone-label"
      className={clsx(
      "px-1.5 py-0.5 rounded text-[9px] font-mono border backdrop-blur-sm flex items-center gap-1 whitespace-nowrap select-none transition-all",
      isDark ? "bg-black/60 border-white/20 text-white" : "bg-white/90 border-slate-300 text-slate-700 shadow-sm",
      isLocked && !isPaused && !isOverride && (isDark ? "bg-emerald-500/20 border-emerald-500 text-emerald-500" : "bg-emerald-50 border-emerald-500 text-emerald-600"),
      isOverride && "bg-red-500/20 border-red-500 text-red-500 animate-pulse",
      isSelected && "ring-1 ring-blue-500/50 scale-110 z-30",
      isPaused && (isDark ? "opacity-60 border-slate-600 bg-slate-900/50" : "opacity-50 grayscale")
    )}
    >
      {isPriority && !isOverride && <Star size={8} className={clsx("fill-current", isDark ? "text-yellow-500" : "text-amber-500")} />}
      {isPaused && <Pause size={7} className="fill-current text-slate-400" />}
      <span className={clsx(isPaused && "line-through decoration-1 opacity-70 text-slate-400")}>
        {isOverride ? `OVERRIDING...` : (isPaused ? `[P] ${displayId}` : displayId)}
      </span>
    </div>
  </Html>
);

