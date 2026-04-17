import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useL4Snapshots } from '@/hooks/l4/useL4Snapshots';
import { L4EventTable } from '@/components/l4/L4EventTable';
import { L4Legend } from '@/components/l4/L4Legend';
import { X } from 'lucide-react';

export const L4DashboardPage = () => {
  const { isDark, sidebarWidth, uiPreferences, setL4RightPanel, restoreDefaultL4Panel, updateFloatingPanel, bringToFront } = useUIStore(useShallow(s => ({ isDark: s.isDark, sidebarWidth: s.sidebarWidth, uiPreferences: s.uiPreferences, setL4RightPanel: s.setL4RightPanel, restoreDefaultL4Panel: s.restoreDefaultL4Panel, updateFloatingPanel: s.updateFloatingPanel, bringToFront: s.bringToFront })));
  const { snapshots, summary } = useL4Snapshots();
  const rightPanel = uiPreferences.l4.rightPanel;
  const isDockOpen = uiPreferences.panels.l4?.isOpen !== false;
  const panelOrder = uiPreferences.panelOrder || [];
  const zIndex = 40 + (panelOrder.includes('l4') ? panelOrder.indexOf('l4') : panelOrder.length);

  if (!isDockOpen || uiPreferences.viewMode === 'focus') return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex }}>
      <div 
        className="absolute bottom-4 left-4 right-4 flex flex-col lg:flex-row items-end gap-4"
        onMouseDown={() => bringToFront('l4')}
      >
          <div className="pointer-events-auto max-h-[32vh] overflow-hidden shrink-0 min-w-0 w-full lg:w-auto" style={{ width: `min(760px, calc(100vw - ${sidebarWidth}px - 344px))` }}>
            <L4EventTable snapshots={snapshots} />
          </div>
          <div className="pointer-events-auto w-full lg:w-[320px] shrink-0 space-y-3 min-w-0">
            <div className={clsx('rounded-xl border p-3', isDark ? 'bg-[#0d1117]/80 border-gray-800' : 'bg-white/80 border-slate-200/60')}>
              <div className="flex items-center justify-between gap-2">
                <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
                  L4 Monitor
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    aria-label="L4 summary dock"
                    data-testid="btn-l4-summary"
                    onClick={() => setL4RightPanel('summary')}
                    className={clsx('px-2 py-1 rounded text-[9px] font-mono uppercase border', rightPanel === 'summary' ? (isDark ? 'border-blue-500/40 bg-blue-500/15 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700') : (isDark ? 'border-white/10 text-gray-400' : 'border-slate-200 text-slate-500'))}
                  >
                    Summary
                  </button>
                  <button
                    aria-label="L4 legend dock"
                    data-testid="btn-l4-guide"
                    onClick={() => setL4RightPanel('legend')}
                    className={clsx('px-2 py-1 rounded text-[9px] font-mono uppercase border', rightPanel === 'legend' ? (isDark ? 'border-blue-500/40 bg-blue-500/15 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700') : (isDark ? 'border-white/10 text-gray-400' : 'border-slate-200 text-slate-500'))}
                  >
                    Guide
                  </button>
                  <button
                    aria-label="L4 dock reset"
                    data-testid="btn-l4-reset"
                    onClick={restoreDefaultL4Panel}
                    className={clsx('px-2 py-1 rounded text-[9px] font-mono uppercase border', isDark ? 'border-white/10 text-gray-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
                  >
                    Reset
                  </button>
                  <button
                    aria-label="L4 dock close"
                    data-testid="btn-l4-close"
                    onClick={() => updateFloatingPanel('l4', { isOpen: false })}
                    className={clsx('p-1 rounded border', isDark ? 'border-white/10 text-gray-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              {rightPanel === 'summary' ? (
                <>
                  <div className={clsx('mt-2 text-[10px] font-mono opacity-80', isDark ? 'text-gray-400' : 'text-slate-600')}>
                    contract {String(summary.contractVersion ?? 'n/a')} · server {summary.serverTime ? new Date(summary.serverTime).toLocaleTimeString() : 'n/a'}
                  </div>
                  <div className={clsx('mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono', isDark ? 'text-gray-300' : 'text-slate-700')}>
                    <div className={clsx('rounded-lg border p-2', isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50')}>
                      TASKS
                      <div className="text-lg font-bold tabular-nums">{summary.taskCount}</div>
                    </div>
                    <div className={clsx('rounded-lg border p-2', isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50')}>
                      GOV
                      <div className="text-lg font-bold tabular-nums">{summary.proposalCount}</div>
                    </div>
                    <div className={clsx('rounded-lg border p-2', isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50')}>
                      CHAN
                      <div className="text-lg font-bold tabular-nums">{summary.channelCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Link
                      to="/status-system"
                      className={clsx('text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-1 rounded-md border', isDark ? 'border-blue-500/30 text-blue-200 hover:bg-blue-500/10' : 'border-blue-200 text-blue-700 hover:bg-blue-50')}
                    >
                      Status Guide
                    </Link>
                    <div className={clsx('text-[10px] font-mono opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
                      compact dock
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3">
                  <L4Legend compact />
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};
