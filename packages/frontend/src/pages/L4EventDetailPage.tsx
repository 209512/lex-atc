import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useL4Snapshots } from '@/hooks/l4/useL4Snapshots';
import { AxisTimeline } from '@/components/l4/AxisTimeline';
import { RawPayloadPanel } from '@/components/l4/RawPayloadPanel';
import { StatusBadge } from '@/components/l4/StatusBadge';
import { formatId } from '@/utils/agentIdentity';

export const L4EventDetailPage = () => {
  const { isDark, sidebarWidth     } = useUIStore(useShallow(s => ({ isDark: s.isDark, sidebarWidth: s.sidebarWidth })));
  const { id } = useParams();
  const decodedId = decodeURIComponent(String(id || ''));
  const { byId, rawState } = useL4Snapshots();

  const snap = useMemo(() => byId.get(decodedId), [byId, decodedId]);

  if (!snap) {
    return (
      <div className="absolute inset-y-4 left-4 z-40 pointer-events-none" style={{ width: `min(680px, calc(100vw - ${sidebarWidth}px - 32px))` }}>
        <div className={clsx('rounded-2xl border p-4 pointer-events-auto shadow-2xl backdrop-blur-md', isDark ? 'bg-[#050505]/92 border-gray-800 text-gray-300' : 'bg-white/92 border-slate-200 text-slate-800')}>
          <Link to="/dashboard" className={clsx('inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em]', isDark ? 'text-blue-200' : 'text-blue-700')}>
            <ChevronLeft size={16} /> Back
          </Link>
          <div className="mt-6">Not found: {formatId(decodedId)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-y-4 left-4 z-40 pointer-events-none" style={{ width: `min(760px, calc(100vw - ${sidebarWidth}px - 32px))` }}>
      <div className={clsx('h-full rounded-2xl border p-6 overflow-auto custom-scrollbar pointer-events-auto shadow-2xl backdrop-blur-md', isDark ? 'bg-[#050505]/92 border-gray-800' : 'bg-white/92 border-slate-200')}>
        <div className="flex items-center justify-between gap-4">
          <Link to="/dashboard" className={clsx('inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em]', isDark ? 'text-blue-200 hover:text-blue-100' : 'text-blue-700 hover:text-blue-600')}>
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/status-system" className={clsx('text-[11px] font-mono uppercase tracking-[0.14em]', isDark ? 'text-gray-400 hover:text-gray-300' : 'text-slate-600 hover:text-slate-800')}>
              Status System
            </Link>
            <Link to="/dashboard" className={clsx('p-2 rounded-lg border', isDark ? 'border-white/10 text-gray-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>
              <X size={16} />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={clsx('text-[18px] font-black tracking-tight', isDark ? 'text-white/80' : 'text-slate-900')}>
              {snap.entityKind} · {formatId(snap.entityId)}
            </div>
            <div className={clsx('mt-1 text-[11px] font-mono opacity-70 tabular-nums', isDark ? 'text-gray-400' : 'text-slate-600')}>
              occurredAt: {new Date(snap.occurredAt).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge axis="isolation" state={snap.states.isolation} />
            <StatusBadge axis="settlement" state={snap.states.settlement} />
            <StatusBadge axis="rollback" state={snap.states.rollback} />
            <StatusBadge axis="admin" state={snap.states.admin} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          <div className="col-span-7 space-y-4">
            <AxisTimeline snapshot={snap} />
            <RawPayloadPanel title="Entity Snapshot" payload={snap} />
          </div>
          <div className="col-span-5 space-y-4">
            <RawPayloadPanel title="Raw SSE State (latest)" payload={rawState} />
            {Boolean((snap.meta as any)?.shard) && (
              <RawPayloadPanel title="Rollback Blast Radius (derived)" payload={{ shardId: (snap.meta as any)?.task?.shardId, shard: snap.meta?.shard, affectedAgents: { holder: (snap.meta as any)?.shard?.holder || null, waiting: (snap.meta as any)?.shard?.waitingAgents || [] } }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
