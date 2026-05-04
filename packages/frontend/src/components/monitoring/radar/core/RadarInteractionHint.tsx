import React from 'react';
import { MousePointer2, Move, ZoomIn } from 'lucide-react';
import clsx from 'clsx';

export const RadarInteractionHint = ({ isDark }: { isDark: boolean }) => {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 pointer-events-none">
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md text-[9px] font-mono font-bold transition-all duration-300',
          isDark ? 'bg-black/40 border-white/10 text-white/60' : 'bg-white/60 border-black/5 text-black/60'
        )}
      >
        <div className="flex items-center gap-1.5 border-r border-current pr-2">
          <MousePointer2 size={10} className="text-blue-500" />
          <span>L-CLICK: SELECT</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-current pr-2">
          <ZoomIn size={10} className="text-emerald-500" />
          <span>SCROLL: ZOOM</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Move size={10} className="text-purple-500" />
          <span>R-CLICK: PAN</span>
        </div>
      </div>
    </div>
  );
};

