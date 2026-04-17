import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useNavigate, Link } from 'react-router-dom';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useL4Snapshots } from '@/hooks/l4/useL4Snapshots';
import { StatusBadge } from '@/components/l4/StatusBadge';
import { StatusAxis } from '@lex-atc/shared';
import { formatId } from '@/utils/agentIdentity';

const axisOrder: StatusAxis[] = ['isolation', 'settlement', 'rollback', 'admin'];

export const L4StatusPanel = () => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const { snapshots, rawState } = useL4Snapshots();
  const navigate = useNavigate();
  const gas = (rawState as any)?.gasEconomics;

  const counts = useMemo(() => {
    const byAxis: Record<string, { inProgress: number; waiting: number; failed: number }> = {
      isolation: { inProgress: 0, waiting: 0, failed: 0 },
      settlement: { inProgress: 0, waiting: 0, failed: 0 },
      rollback: { inProgress: 0, waiting: 0, failed: 0 },
      admin: { inProgress: 0, waiting: 0, failed: 0 },
    };

    const rows = snapshots.filter(s => s.entityKind !== 'AGENT');
    for (const s of rows) {
      for (const a of axisOrder) {
        const c = s.states[a]?.code;
        if (c === 'IN_PROGRESS') byAxis[a].inProgress += 1;
        if (c === 'WAITING_ADMIN') byAxis[a].waiting += 1;
        if (c === 'FAILED') byAxis[a].failed += 1;
      }
    }
    return byAxis;
  }, [snapshots]);

  const top = useMemo(() => {
    const rows = snapshots.filter(s => s.entityKind !== 'AGENT');
    return rows
      .filter(s => axisOrder.some(a => ['IN_PROGRESS', 'WAITING_ADMIN', 'FAILED'].includes(s.states[a]?.code)))
      .slice(0, 5);
  }, [snapshots]);

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
          L4 Monitoring
        </div>
        <button
          onClick={() => navigate('/status-system')}
          aria-label="Status guide 열기"
          data-testid="l4-status-guide"
          className={clsx('shrink-0 text-[10px] font-mono uppercase tracking-[0.12em] opacity-80', isDark ? 'text-blue-200 hover:opacity-100' : 'text-blue-700 hover:opacity-100')}
        >
          guide
        </button>
      </div>
      {gas && (
        <div className={clsx('mt-2 rounded-lg border px-2 py-2 text-[10px] font-mono', isDark ? 'border-white/10 bg-black/30 text-emerald-200' : 'border-slate-200 bg-slate-50 text-emerald-800')}>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="uppercase tracking-[0.12em] opacity-80 min-w-0 truncate">L1/L2 Gas Savings (%)</span>
            <span className="font-bold">{Number(gas.savingsPct || 0).toFixed(2)}%</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 min-w-0">
              <span className="uppercase tracking-[0.12em] opacity-80 min-w-0 truncate">Total Saved (USD)</span>
              <span className="font-bold">${Number(gas.savedUsd || 0).toFixed(4)}</span>
            </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {axisOrder.map((a) => (
          <div key={a} className={clsx('rounded-lg border p-2', isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50')}>
            <div className={clsx('text-[10px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-400' : 'text-slate-600')}>
              {a}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] font-mono">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-slate-700')}>IP {counts[a].inProgress}</span>
              <span className={clsx(isDark ? 'text-amber-200' : 'text-amber-800')}>WA {counts[a].waiting}</span>
              <span className={clsx(isDark ? 'text-red-200' : 'text-red-700')}>F {counts[a].failed}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={clsx('mt-3 text-[10px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-400' : 'text-slate-600')}>
        Watchlist
      </div>
      <div className="mt-2 space-y-2">
        {top.map((s) => (
          <Link
            key={`${s.entityKind}:${s.entityId}`}
            to={`/events/${encodeURIComponent(s.entityId)}`}
            className={clsx('block rounded-lg border px-2 py-2 transition min-w-0', isDark ? 'border-white/10 bg-black/30 hover:border-blue-500/30 hover:bg-black/40' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50')}
          >
            <div className={clsx('text-[10px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
              {s.entityKind}:{formatId(s.entityId)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 max-w-full">
              {axisOrder.map((a) => (
                <StatusBadge key={a} axis={a} state={s.states[a]} compact />
              ))}
            </div>
          </Link>
        ))}
        {top.length === 0 && (
          <div className={clsx('text-[10px] font-mono opacity-60 text-left', isDark ? 'text-gray-500' : 'text-slate-500')}>
            No active items.
          </div>
        )}
      </div>
    </div>
  );
};
