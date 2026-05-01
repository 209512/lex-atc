import React from 'react';
import clsx from 'clsx';
import { PanelRightOpen, Settings, Siren, Users, Gavel, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useATCStore } from '@/store/atc';
import { frontendConfig } from '@/config/runtime';

export const SidebarCompactRail = ({ onOpenSettings, onExpand }: { onOpenSettings: () => void; onExpand: () => void }) => {
  const state = useATCStore(useShallow(s => s.state));
  const { triggerOverride, releaseLock  } = useATCStore(useShallow(s => ({ triggerOverride: s.actions.triggerOverride, releaseLock: s.actions.releaseLock })));
  const { isDark, setIsDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark, setIsDark: s.setIsDark })));
  const mswFallback = Boolean((window as any)['__LEX_ATC_MSW_DISABLED__']);
  const modeLabel = mswFallback ? 'BACKEND (FALLBACK)' : (frontendConfig.deployment.mode === 'standalone' ? 'SIMULATION' : 'BACKEND');
  const badgeText = modeLabel.startsWith('SIMULATION') ? 'SIM' : (modeLabel.startsWith('BACKEND') ? 'API' : modeLabel);

  const metrics = [
    { icon: Users, label: 'Agents', value: String(state.activeAgentCount || 0) },
    { icon: Gavel, label: 'Gov', value: String(state.governance?.proposals?.length || 0) },
    { icon: ShieldAlert, label: 'Tasks', value: String(state.isolation?.summary?.waitingAdmin || 0) },
  ];

  return (
    <div className="flex h-full flex-col items-center justify-between py-4">
      <div className="flex flex-col items-center gap-3">
        <Tooltip content="Expand Sidebar" position="left">
          <button onClick={onExpand} className={clsx('p-2.5 rounded-xl border', isDark ? 'border-white/10 bg-white/[0.04] text-blue-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-blue-700 hover:bg-slate-50')}>
            <PanelRightOpen size={18} />
          </button>
        </Tooltip>
        <div className={clsx('h-px w-8', isDark ? 'bg-white/10' : 'bg-slate-200')} />
        {metrics.map(({ icon: Icon, label, value }) => (
          <Tooltip key={label} content={`${label}: ${value}`} position="left">
            <div className={clsx('w-12 rounded-xl border px-2 py-2 flex flex-col items-center gap-1', isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white')}>
              <Icon size={14} className={isDark ? 'text-gray-400' : 'text-slate-500'} />
              <span className={clsx('text-[9px] font-mono font-bold', isDark ? 'text-gray-200' : 'text-slate-800')}>{value}</span>
            </div>
          </Tooltip>
        ))}
        <Tooltip content={state.overrideSignal ? 'Manual Override Active' : 'Nominal'} position="left">
          <div className={clsx('w-12 rounded-xl border px-2 py-2 flex flex-col items-center gap-1', state.overrideSignal ? 'border-red-500/30 bg-red-500/10 text-red-300' : (isDark ? 'border-white/10 bg-white/[0.03] text-emerald-300' : 'border-slate-200 bg-white text-emerald-700'))}>
            <Siren size={14} />
            <span className="text-[8px] font-mono font-bold">{state.overrideSignal ? 'OVR' : 'OK'}</span>
          </div>
        </Tooltip>
        <Tooltip content={state.overrideSignal ? 'Release Override' : 'Emergency Override'} position="left">
          <button
            onClick={() => (state.overrideSignal ? releaseLock() : triggerOverride())}
            className={clsx('w-12 rounded-xl border px-2 py-2 flex flex-col items-center gap-1', state.overrideSignal ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300')}
          >
            {state.overrideSignal ? <Unlock size={14} /> : <Lock size={14} />}
            <span className="text-[8px] font-mono font-bold">{state.overrideSignal ? 'REL' : 'OVR'}</span>
          </button>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Tooltip content={modeLabel} position="left">
          <div
            className={clsx(
              'px-2 py-1 rounded border text-[9px] font-bold uppercase tracking-[0.12em]',
              modeLabel.startsWith('SIMULATION') && (isDark ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-800'),
              modeLabel.startsWith('BACKEND') && (isDark ? 'border-sky-400/30 bg-sky-400/10 text-sky-200' : 'border-sky-300 bg-sky-50 text-sky-800')
            )}
            data-testid="deployment-mode-badge-rail"
          >
            {badgeText}
          </div>
        </Tooltip>
        <Tooltip content="Toggle Theme" position="left">
          <button onClick={() => setIsDark((prev) => !prev)} className={clsx('p-2 rounded-lg', isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}>
            {isDark ? '🌙' : '☀️'}
          </button>
        </Tooltip>
        <Tooltip content="Open Settings" position="left">
          <button onClick={onOpenSettings} className={clsx('p-2.5 rounded-xl border', isDark ? 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
            <Settings size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
