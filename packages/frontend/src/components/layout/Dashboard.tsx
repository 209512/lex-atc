import { useShallow } from 'zustand/react/shallow';
// src/components/layout/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { ControlTower } from '@/components/layout/ControlTower';
import { GlobalModals } from '@/components/layout/GlobalModals';
import clsx from 'clsx';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { useModalStore } from '@/store/ui/modalStore';
import { ScrollText } from 'lucide-react';
import { Joyride, Step } from 'react-joyride';

import { useTranslation } from 'react-i18next';

const RadarLazy = React.lazy(() => import('@/components/monitoring/radar').then(m => ({ default: m.Radar })));

export const Dashboard = () => {
  const { state, agents } = useATCStore(useShallow(s => ({ state: s.state, agents: s.agents })));
  const { isDark, viewMode, uiPreferences  } = useUIStore(useShallow(s => ({ isDark: s.isDark, viewMode: s.viewMode, uiPreferences: s.uiPreferences })));
  const { setPolicyModalOpen } = useModalStore();

  const { viewMode: systemViewMode } = uiPreferences;
  
  const { t } = useTranslation();

  const [runTour, setRunTour] = useState(false);
  const [radarReady, setRadarReady] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('lex-atc-tour-seen');
    if (!hasSeenTour) {
      setRunTour(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setRadarReady(true);
    };

    const w = window as any;
    if (typeof w?.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(markReady, { timeout: 1500 });
      return () => {
        cancelled = true;
        if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      };
    }

    const t = setTimeout(markReady, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const handleJoyrideEvent = (data: any) => {
    const status = data?.state?.status || data?.status;
    if (['finished', 'skipped'].includes(status as any)) {
      setRunTour(false);
      localStorage.setItem('lex-atc-tour-seen', 'true');
    }
  };

  const tourSteps: any[] = [
    {
      target: 'body',
      content: t('tour.welcome'),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '.tour-step-radar',
      content: t('tour.radar'),
      placement: 'right',
    },
    {
      target: '.tour-step-sidebar',
      content: t('tour.sidebar'),
      placement: 'left',
    },
    {
      target: '.tour-step-terminal',
      content: t('tour.terminal'),
      placement: 'top',
    },
    {
      target: '.tour-step-emergency',
      content: t('tour.emergency'),
      placement: 'bottom',
    },
  ];

  return (
    <main className={clsx(
        "flex-1 min-w-0 relative flex flex-col h-full overflow-hidden transition-colors duration-500",
        isDark ? "bg-[#050505]" : "bg-slate-100"
    )}>
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        onEvent={handleJoyrideEvent}
        styles={{
          options: {
            primaryColor: '#ef4444',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            textColor: isDark ? '#f8fafc' : '#334155',
            zIndex: 1000,
          }
        } as any}
      />
      
      {/* 상단 시스템 정보 */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none select-none flex flex-col gap-4 items-start">
        <div>
          <h1 className={clsx("text-2xl md:text-4xl font-black tracking-tighter uppercase transition-colors duration-500", 
            isDark ? "text-white/30" : "text-slate-900/30"
          )}>
            {t('dashboard.title')}
          </h1>
          <div className="flex items-center gap-3 mt-1 opacity-60 font-mono text-[10px]">
            <span className={clsx("w-2 h-2 rounded-full animate-pulse", 
              state.overrideSignal ? "bg-red-500" : "bg-emerald-500"
            )}></span>
            <span className="font-bold uppercase">System: {state.overrideSignal ? "Override Active" : "Nominal"}</span>
            <span className="opacity-30">|</span>
            <span>LAT: {state.latency}ms</span>
          </div>
        </div>

        {/* Quick Policies Button */}
        <button 
          onClick={() => setPolicyModalOpen(true)}
          className={clsx(
            "pointer-events-auto px-3 py-1.5 rounded-lg border backdrop-blur-md shadow-lg flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.1em] transition-all hover:scale-105",
            isDark ? "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white" : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white hover:text-slate-900"
          )}
        >
          <ScrollText size={12} />
          Quick Policies
        </button>
      </div>

      {/* 레이더 캔버스 영역 */}
      <div className="flex-1 w-full h-full relative z-[1] tour-step-radar">
        {viewMode === 'detached' && systemViewMode !== 'executive' && (
          <div className={clsx(
            "absolute inset-0 transition-opacity duration-500 pointer-events-auto",
            "opacity-100"
          )}>
            <React.Suspense fallback={null}>
              {radarReady && <RadarLazy isMainView={true} key={isDark ? 'dark-radar' : 'light-radar'} />}
            </React.Suspense>
          </div>
        )}

        {/* Executive Mode Placeholder */}
        {systemViewMode === 'executive' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md z-10">
            <div className="text-center p-8 rounded-xl border border-gray-800 bg-gray-900/80 shadow-2xl">
              <h2 className="text-2xl font-black text-white tracking-widest mb-4">EXECUTIVE SUMMARY</h2>
              <div className="grid grid-cols-3 gap-6 text-left">
                <div className="p-4 border border-gray-700 rounded-lg bg-black/50">
                  <div className="text-gray-400 text-xs font-mono uppercase">Total Agents</div>
                  <div className="text-3xl font-bold text-blue-400">{agents.length}</div>
                </div>
                <div className="p-4 border border-gray-700 rounded-lg bg-black/50">
                  <div className="text-gray-400 text-xs font-mono uppercase">System Latency</div>
                  <div className="text-3xl font-bold text-emerald-400">{state.latency}ms</div>
                </div>
                <div className="p-4 border border-gray-700 rounded-lg bg-black/50">
                  <div className="text-gray-400 text-xs font-mono uppercase">Active Shards</div>
                  <div className="text-3xl font-bold text-purple-400">{Object.keys(state.shards || {}).length}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 대기 모드 오버레이: attached 모드일 때만 활성화 */}
        {viewMode === 'attached' && (
          <div className={clsx(
            "absolute inset-0 flex flex-col items-center justify-center font-mono transition-all duration-500 bg-black/60 backdrop-blur-sm z-20",
            "opacity-100"
          )}>
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-blue-400 font-bold tracking-[0.2em] animate-pulse uppercase">Radar Data Externalized</span>
            </div>
          </div>
        )}
      </div>

      {/* 전역 HUD (ControlTower contains Sidebar, Terminal, etc.) */}
      <ControlTower />
      <GlobalModals />
    </main>
  );
};
