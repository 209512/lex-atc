import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { L4StatusSnapshot, StatusAxis } from '@lex-atc/shared';
import { StatusBadge } from '@/components/l4/StatusBadge';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { formatId } from '@/utils/agentIdentity';

const axisOrder: StatusAxis[] = ['isolation', 'settlement', 'rollback', 'admin'];

const kindLabel = (k: string) => {
  if (k === 'TASK') return 'TASK';
  if (k === 'PROPOSAL') return 'GOV';
  if (k === 'CHANNEL') return 'CHAN';
  if (k === 'AGENT') return 'AGENT';
  return k;
};

export const L4EventTable = ({ snapshots }: { snapshots: L4StatusSnapshot[] }) => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const [axisFilter, setAxisFilter] = useState<StatusAxis | 'all'>('all');
  const [onlyActive, setOnlyActive] = useState(true);

  const rows = useMemo(() => {
    const filtered = snapshots.filter(s => s.entityKind !== 'AGENT');
    return filtered
      .filter(s => {
        if (axisFilter === 'all') return true;
        return s.states?.[axisFilter]?.code !== 'NOT_STARTED';
      })
      .filter(s => {
        if (!onlyActive) return true;
        const codes = axisOrder.map(a => s.states?.[a]?.code);
        return codes.some(c => c === 'IN_PROGRESS' || c === 'WAITING_ADMIN' || c === 'FAILED');
      })
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  }, [snapshots, axisFilter, onlyActive]);

  return (
    <div className={clsx('rounded-xl border p-3 pointer-events-auto', isDark ? 'bg-[#0d1117]/80 border-gray-800' : 'bg-white/80 border-slate-200/60')}>
      <div className="flex items-center justify-between gap-2">
        <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
          L4 Audit Trail
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setOnlyActive(v => !v)}
            className={clsx(
              'px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-[0.12em] border transition',
              onlyActive
                ? (isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800')
                : (isDark ? 'bg-black/30 border-white/10 text-gray-400 hover:border-amber-500/20' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-200')
            )}
          >
            Active only
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button onClick={() => setAxisFilter('all')} className={clsx('px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-[0.12em] border transition', axisFilter === 'all' ? (isDark ? 'bg-blue-600/20 border-blue-500/40 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700') : (isDark ? 'bg-black/30 border-white/10 text-gray-400' : 'bg-white border-slate-200 text-slate-500'))}>all</button>
            {axisOrder.map(a => (
              <button key={a} onClick={() => setAxisFilter(a)} className={clsx('px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-[0.12em] border transition', axisFilter === a ? (isDark ? 'bg-blue-600/20 border-blue-500/40 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700') : (isDark ? 'bg-black/30 border-white/10 text-gray-400' : 'bg-white border-slate-200 text-slate-500'))}>{a}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2 max-h-[360px] overflow-auto custom-scrollbar pr-1">
        {rows.map((s) => (
          <Link
            key={`${s.entityKind}:${s.entityId}`}
            to={`/events/${encodeURIComponent(s.entityId)}`}
            className={clsx(
              'block rounded-lg border px-3 py-2 transition',
              isDark ? 'border-white/10 bg-black/30 hover:border-blue-500/30 hover:bg-black/40' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={clsx('text-[10px] font-mono px-2 py-0.5 rounded border', isDark ? 'border-white/10 text-gray-400 bg-black/40' : 'border-slate-200 text-slate-600 bg-slate-50')}>
                    {kindLabel(String(s.entityKind))}
                  </span>
                  <div className={clsx('text-[11px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
                    {formatId(s.entityId)}
                  </div>
                </div>
                <div className={clsx('mt-1 text-[10px] font-mono opacity-70 tabular-nums', isDark ? 'text-gray-500' : 'text-slate-500')}>
                  {new Date(s.occurredAt).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {axisOrder.map((a) => (
                  <StatusBadge key={a} axis={a} state={s.states[a]} compact />
                ))}
              </div>
            </div>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className={clsx('text-[10px] font-mono opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
            No events match current filters.
          </div>
        )}
      </div>
    </div>
  );
};
