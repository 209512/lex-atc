import React from 'react';
import clsx from 'clsx';
import { Tooltip } from '@/components/common/Tooltip';
import { RISK_AXIS_META, RISK_AXIS_INDEX } from '@/utils/riskVector';

export const RiskVectorBars = ({
  axes,
  riskVector,
  isDark,
}: {
  axes: readonly string[];
  riskVector: readonly number[];
  isDark: boolean;
}) => {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1" data-testid="risk-vector-bars">
      {axes.map((k) => {
        const i = RISK_AXIS_INDEX[k as keyof typeof RISK_AXIS_INDEX];
        const v = riskVector[i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7] ?? 0;
        const meta = RISK_AXIS_META[k as keyof typeof RISK_AXIS_META];
        return (
          <div key={k} className="flex items-center gap-2" data-testid={`risk-axis-${k}`}>
            <Tooltip content={`${meta.name} — ${meta.description}`} position="top">
              <div className="w-6 text-[9px] font-mono opacity-60">{k}</div>
            </Tooltip>
            <div className={clsx("flex-1 h-2 rounded overflow-hidden", isDark ? "bg-white/10" : "bg-slate-200")}>
              <div
                className={clsx("h-full rounded", isDark ? "bg-emerald-400" : "bg-emerald-600")}
                style={{ width: `${Math.round(v * 100)}%` }}
              />
            </div>
            <div className="w-8 text-right text-[9px] font-mono opacity-80">{Number(v).toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
};

