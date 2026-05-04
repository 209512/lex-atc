import React from 'react';
import { Html } from '@react-three/drei';
import clsx from 'clsx';

export const AgentDroneRecentLogPills = ({ logs }: { logs: any[] }) => {
  return logs.map((log, idx) => (
    <Html
      key={log.id}
      position={[0, 1.5 + idx * 0.4, 0]}
      center
      distanceFactor={15}
      zIndexRange={[0, 10]}
      style={{ pointerEvents: 'none' }}
    >
      {(() => {
        const msg = String(log.message || '');
        const isSol = msg.includes('SOL');
        const isNeg = isSol && /-\s*\d/.test(msg);
        const isPos = isSol && /\+\s*\d/.test(msg);
        const pillClass =
          log.type === 'critical' || msg.includes('Slash')
            ? 'bg-red-500 text-white border-red-400 scale-125'
            : isNeg
              ? 'bg-black/60 text-red-200 border-red-400/50'
              : isPos
                ? 'bg-black/60 text-emerald-200 border-emerald-400/50'
                : isSol
                  ? 'bg-black/60 text-slate-200 border-slate-400/40'
                  : 'bg-black/70 text-white border-gray-500';
        const text = isSol ? msg.split(' ').slice(-2).join(' ') : msg.includes('Slash') ? '💥 SLASHED' : msg.slice(0, 15);
        return (
          <div className={clsx('px-1.5 py-0.5 rounded text-[8px] font-mono border whitespace-nowrap animate-bounce shadow-lg', pillClass)}>
            {text}
          </div>
        );
      })()}
    </Html>
  ));
};

