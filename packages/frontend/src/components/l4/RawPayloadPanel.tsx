import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { STATUS_CATALOG, StatusAxis, StatusCode } from '@lex-atc/shared';

const known = new Set(STATUS_CATALOG.map(r => `${r.axis}:${r.code}`));

const findUnknown = (snapshot: any) => {
  const unknown: Array<{ axis: StatusAxis; code: StatusCode }> = [];
  const states = snapshot?.states || {};
  (['isolation', 'settlement', 'rollback', 'admin'] as StatusAxis[]).forEach((axis) => {
    const code = String(states?.[axis]?.code || 'UNKNOWN') as StatusCode;
    if (!known.has(`${axis}:${code}`)) unknown.push({ axis, code });
  });
  return unknown;
};

export const RawPayloadPanel = ({ title, payload }: { title: string; payload: any }) => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const unknown = useMemo(() => findUnknown(payload), [payload]);
  const text = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  return (
    <div className={clsx('rounded-xl border p-3', isDark ? 'bg-[#0d1117]/80 border-gray-800' : 'bg-white/80 border-slate-200/60')}>
      <div className="flex items-center justify-between gap-2">
        <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
          {title}
        </div>
        {unknown.length > 0 && (
          <div className={clsx('text-[10px] font-mono px-2 py-1 rounded-md border', isDark ? 'border-amber-500/30 text-amber-200 bg-amber-500/10' : 'border-amber-200 text-amber-800 bg-amber-50')}>
            CONTRACT WARNING ({unknown.map(u => `${u.axis}:${u.code}`).join(', ')})
          </div>
        )}
      </div>

      <pre className={clsx('mt-3 text-[10px] font-mono leading-snug max-h-[380px] overflow-auto custom-scrollbar rounded-lg p-3 border', isDark ? 'bg-black/40 border-white/10 text-gray-300' : 'bg-slate-50 border-slate-200 text-slate-800')}>
        {text}
      </pre>
    </div>
  );
};
