import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { STATUS_CATALOG, StatusAxis } from '@lex-atc/shared';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { StatusBadge } from '@/components/l4/StatusBadge';

const axisOrder: StatusAxis[] = ['isolation', 'settlement', 'rollback', 'admin'];

export const L4Legend = ({ compact = false }: { compact?: boolean }) => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const [axis, setAxis] = useState<StatusAxis>('isolation');

  const rows = useMemo(() => {
    return STATUS_CATALOG.filter((r) => r.axis === axis);
  }, [axis]);

  return (
    <div className={clsx('rounded-xl border p-3', isDark ? 'bg-[#0d1117]/80 border-gray-800' : 'bg-white/80 border-slate-200/60')}>
      <div className="flex items-center justify-between gap-2">
        <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
          Status Legend
        </div>
        <div className="flex items-center gap-1">
          {axisOrder.map((a) => (
            <button
              key={a}
              onClick={() => setAxis(a)}
              className={clsx(
                'px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-[0.12em] border transition',
                axis === a
                  ? (isDark ? 'bg-blue-600/20 border-blue-500/40 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700')
                  : (isDark ? 'bg-black/30 border-white/10 text-gray-400 hover:border-blue-500/30' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-200')
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className={clsx('mt-3 grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1')}>
        {rows.map((r) => (
          <div key={`${r.axis}:${r.code}`} className="flex items-start justify-between gap-3">
            <StatusBadge
              axis={r.axis}
              state={{ axis: r.axis, code: r.code, updatedAt: new Date(0).toISOString(), message: r.definitionKo, labelOverride: r.code }}
              compact={compact}
            />
            {!compact && (
              <div className={clsx('text-[10px] leading-snug opacity-80', isDark ? 'text-gray-400' : 'text-slate-600')}>
                <div className="font-semibold">{r.labelKo}</div>
                <div>{r.definitionKo}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
