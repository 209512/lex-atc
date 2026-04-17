import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, Circle, PauseCircle, Skull } from 'lucide-react';
import { AxisState, StatusAxis, StatusCode } from '@lex-atc/shared';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';

const axisColor = (axis: StatusAxis) => {
  if (axis === 'isolation') return 'blue';
  if (axis === 'settlement') return 'emerald';
  if (axis === 'rollback') return 'orange';
  return 'purple';
};

const iconFor = (code: StatusCode) => {
  if (code === 'IN_PROGRESS') return <Clock size={12} />;
  if (code === 'WAITING_ADMIN') return <PauseCircle size={12} />;
  if (code === 'SUCCEEDED') return <CheckCircle2 size={12} />;
  if (code === 'FAILED') return <Skull size={12} />;
  if (code === 'ABORTED') return <AlertTriangle size={12} />;
  if (code === 'QUEUED') return <Circle size={12} />;
  return <Circle size={12} />;
};

const labelFor = (axis: StatusAxis, code: StatusCode, override?: string) => {
  const ax = axis.toUpperCase();
  if (override) return `${ax} · ${override}`;
  return `${ax} · ${code}`;
};

export const StatusBadge = ({ axis, state, compact = false }: { axis: StatusAxis; state: AxisState; compact?: boolean }) => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const c = axisColor(axis);
  const code = state.code;

  const base = isDark ? 'bg-black/40 border-white/10 text-gray-200' : 'bg-white border-slate-200 text-slate-800';
  const glow =
    code === 'FAILED'
      ? 'shadow-[0_0_10px_rgba(239,68,68,0.35)]'
      : code === 'WAITING_ADMIN'
        ? 'shadow-[0_0_10px_rgba(245,158,11,0.25)]'
        : code === 'IN_PROGRESS'
          ? 'shadow-[0_0_10px_rgba(59,130,246,0.25)]'
          : '';

  const accent =
    c === 'blue'
      ? 'border-blue-500/30 text-blue-200'
      : c === 'emerald'
        ? 'border-emerald-500/30 text-emerald-200'
        : c === 'orange'
          ? 'border-orange-500/30 text-orange-200'
          : 'border-purple-500/30 text-purple-200';

  const danger = code === 'FAILED' ? (isDark ? 'border-red-500/40 text-red-200' : 'border-red-300 text-red-700') : null;
  const wait = code === 'WAITING_ADMIN' ? (isDark ? 'border-amber-500/40 text-amber-200' : 'border-amber-300 text-amber-800') : null;

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
        base,
        glow,
        danger || wait || accent,
        compact && 'px-1.5 py-0.5 text-[9px]'
      )}
      title={state.message || ''}
    >
      <span className={clsx(code === 'IN_PROGRESS' && 'animate-pulse')}>{iconFor(code)}</span>
      <span className="truncate max-w-[160px]">{labelFor(axis, code, state.labelOverride)}</span>
    </div>
  );
};
