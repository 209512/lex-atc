import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { Html } from '@react-three/drei';
import clsx from 'clsx';
import { Tooltip } from '@/components/common/Tooltip';
import { useUIStore } from '@/store/ui';
import { RISK_AXIS_META, RISK_AXIS_INDEX, normalizeRiskVector8, splitRiskVectorRows, getAxesForDisplayMode } from '@/utils/riskVector';
import type { RiskAxisKey } from '@/utils/riskVector';

interface AgentDroneRiskTooltipProps {
  agentData: any;
  isDark: boolean;
}

const RiskRow = ({ keys, rv }: { keys: readonly RiskAxisKey[]; rv: number[] }) => (
  <div className={clsx(
    "grid gap-x-1 gap-y-1",
    keys.length <= 2 ? "grid-cols-2" : "grid-cols-4"
  )}>
    {keys.map((k) => {
      const v = rv[RISK_AXIS_INDEX[k] as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7];
      return (
        <div key={k} className="flex items-center gap-1 min-w-0">
          <Tooltip content={`${RISK_AXIS_META[k as keyof typeof RISK_AXIS_META].name} — ${RISK_AXIS_META[k as keyof typeof RISK_AXIS_META].description}`} position="top">
            <span className="opacity-70 shrink-0">{k}:</span>
          </Tooltip>
          <span className="opacity-90 tabular-nums">{v.toFixed(2)}</span>
        </div>
      );
    })}
  </div>
);

export const AgentDroneRiskTooltip = ({ agentData, isDark }: AgentDroneRiskTooltipProps) => {
  const { displayMode } = useUIStore(useShallow(s => ({ displayMode: s.uiPreferences?.riskVector?.displayMode ?? 'full' })));
  const rv = normalizeRiskVector8(agentData?.riskVector);
  const axes = getAxesForDisplayMode(displayMode);
  const [row1, row2] = splitRiskVectorRows(axes);

  return (
    <Html position={[0, 1.6, 0]} center distanceFactor={15} zIndexRange={[0, 10]} style={{ pointerEvents: 'none' }}>
      <div className={clsx(
        "w-[280px] max-w-[80vw] px-2.5 py-1.5 rounded border text-[8px] leading-snug font-mono backdrop-blur-sm overflow-hidden",
        isDark ? "bg-black/70 border-white/20 text-white" : "bg-white/90 border-slate-300 text-slate-700"
      )}>
        <div className="space-y-0.5">
          <RiskRow keys={row1 as RiskAxisKey[]} rv={rv} />
          {axes.length > 4 && <RiskRow keys={row2 as RiskAxisKey[]} rv={rv} />}
        </div>
      </div>
    </Html>
  );
};

