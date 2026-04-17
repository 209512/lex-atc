import React from 'react';
import clsx from 'clsx';
import { StatusAxis } from '@lex-atc/shared';
import { StatusBadge } from '@/components/l4/StatusBadge';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';

const axisOrder: StatusAxis[] = ['isolation', 'settlement', 'rollback', 'admin'];

export const AxisTimeline = ({ snapshot }: { snapshot: any }) => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));

  return (
    <div className="grid grid-cols-1 gap-3">
      {axisOrder.map((axis) => {
        const s = snapshot?.states?.[axis];
        const updated = s?.updatedAt ? new Date(s.updatedAt).toLocaleString() : '';
        return (
          <div
            key={axis}
            className={clsx(
              'rounded-xl border p-3',
              isDark ? 'bg-[#0d1117]/80 border-gray-800' : 'bg-white/80 border-slate-200/60'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge axis={axis} state={s} />
                <div className={clsx('text-[10px] font-mono tabular-nums opacity-70 truncate', isDark ? 'text-gray-400' : 'text-slate-500')}>
                  {updated}
                </div>
              </div>
              <div className={clsx('text-[10px] font-mono opacity-70 truncate max-w-[240px]', isDark ? 'text-gray-500' : 'text-slate-500')}>
                {s?.message || ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
