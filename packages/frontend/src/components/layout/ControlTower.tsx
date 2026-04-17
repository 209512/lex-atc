// src/components/layout/ControlTower.tsx
import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { TerminalLog } from '@/components/monitoring/terminal/TerminalLog';
import { QueueDisplay } from '@/components/monitoring/queue/QueueDisplay';
import { TacticalPanel } from '@/components/command/TacticalPanel';
import { SlashingHeatmap } from '@/components/monitoring/heatmap/SlashingHeatmap';
import { SmartAlerts } from '@/components/monitoring/alerts/SmartAlerts';
import { useUIStore } from '@/store/ui';
import { useATCStore } from '@/store/atc';
import clsx from 'clsx';

export const ControlTower = () => {
    const { sidebarWidth, isDark, uiPreferences, updateFloatingPanel, bringToFront } = useUIStore(useShallow(s => ({ sidebarWidth: s.sidebarWidth, isDark: s.isDark, uiPreferences: s.uiPreferences, updateFloatingPanel: s.updateFloatingPanel, bringToFront: s.bringToFront })));
    const { state, agents } = useATCStore();
    const { viewMode } = uiPreferences;

    // Responsive rebound effect
    React.useEffect(() => {
        const handleResize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            ['tactical', 'terminal', 'queue', 'l4'].forEach((panelId) => {
                const p = uiPreferences.panels[panelId as keyof typeof uiPreferences.panels];
                if (p) {
                    let newX = p.x;
                    let newY = p.y;
                    let changed = false;
                    const pw = p.width || 300;
                    const ph = p.height || 300;
                    
                    if (newX + pw > w) { newX = Math.max(0, w - pw - 20); changed = true; }
                    if (newY + ph > h) { newY = Math.max(0, h - ph - 20); changed = true; }
                    if (newX < 0) { newX = 20; changed = true; }
                    if (newY < 0) { newY = 20; changed = true; }

                    if (changed) {
                        updateFloatingPanel(panelId as any, { x: newX, y: newY });
                    }
                }
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [uiPreferences, updateFloatingPanel]);

    // Find the most recent slashing or dispute event in the last 15 seconds
    const recentSlashingEvent = React.useMemo(() => {
        const logsArray = state?.logs || [];
        const now = Date.now();
        return logsArray.find(log => {
            if (log.actionKey !== 'SETTLEMENT_DISPUTE' && log.actionKey !== 'SETTLEMENT_SLASH') return false;
            const logTime = new Date(log.timestamp).getTime();
            return (now - logTime) < 15000; // Show for 15 seconds
        });
    }, [state?.logs]);

    const heatmapProps = React.useMemo(() => {
        if (!recentSlashingEvent) return null;
        const agentId = recentSlashingEvent.agentId || recentSlashingEvent.meta?.agentId || 'UNKNOWN';
        const agent = agents.find(a => a.id === agentId || a.uuid === agentId);
        
        return {
            agentId,
            metrics: {
                latency: agent?.metrics?.latency || 0,
                conflictRate: recentSlashingEvent.meta?.metrics?.conflictRate ?? ((agent?.metrics?.collisions || 0) / 100),
                balanceDrain: recentSlashingEvent.meta?.metrics?.balanceDrain ?? ((agent?.account?.balance || 0) < 5000 ? ((10000 - (agent?.account?.balance || 0)) / 10000) * 100 : 0),
                anomalyScore: recentSlashingEvent.meta?.metrics?.anomalyScore ?? (agent?.metrics?.anomalyScore || 0.92),
                arweaveTxId: recentSlashingEvent.meta?.arweaveTxId
            }
        };
    }, [recentSlashingEvent, agents]);

    const isL4Open = uiPreferences.panels.l4?.isOpen !== false;
    const isTerminalOpen = uiPreferences.panels.terminal?.isOpen !== false;
    const isQueueOpen = uiPreferences.panels.queue?.isOpen !== false;
    const isTacticalOpen = uiPreferences.panels.tactical?.isOpen !== false;

    const closedPanels = [];
    if (!isQueueOpen && viewMode === 'operator') closedPanels.push({ id: 'queue', label: 'QUEUE' });
    if (!isTacticalOpen && viewMode === 'operator') closedPanels.push({ id: 'tactical', label: 'TACTICAL' });
    if (!isTerminalOpen && viewMode === 'operator') closedPanels.push({ id: 'terminal', label: 'TERMINAL' });
    if (!isL4Open && viewMode !== 'executive') closedPanels.push({ id: 'l4', label: 'L4' });

    return (
        <div 
            className={clsx(
                "fixed top-0 left-0 transition-all duration-300 pointer-events-none",
                viewMode === 'focus' ? "" : ""
            )}
            style={{ 
                zIndex: 40,
                width: `calc(100vw - ${sidebarWidth}px)`, 
                height: '100vh' 
            }}
        >
            {viewMode === 'focus' && (
                <div className="absolute inset-0 bg-black/20 pointer-events-none z-0" />
            )}

            {viewMode === 'operator' && (
                <>
                    <div className="tour-step-terminal">
                        <TerminalLog />
                    </div>
                    <QueueDisplay />
                    <TacticalPanel />
                    <SmartAlerts />
                    {heatmapProps && (
                        <div className="pointer-events-auto">
                            <SlashingHeatmap 
                                agentId={heatmapProps.agentId} 
                                metrics={heatmapProps.metrics} 
                                isVisible={true} 
                            />
                        </div>
                    )}
                </>
            )}
            
            {closedPanels.length > 0 && (
                <div className="fixed top-1/2 -translate-y-1/2 left-4 pointer-events-auto flex flex-col items-start gap-2">
                    {closedPanels.map(panel => (
                        <button
                            key={panel.id}
                            data-testid={`btn-${panel.id}-restore`}
                            aria-label={`${panel.label} 창 열기`}
                            onClick={() => {
                                updateFloatingPanel(panel.id as any, { isOpen: true });
                                bringToFront(panel.id as any);
                            }}
                            className={clsx(
                                "rounded-lg border px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] shadow-xl transition-all hover:translate-x-1 origin-left",
                                isDark ? "bg-[#0d1117]/90 border-gray-800 text-gray-200 hover:bg-[#161b22] hover:border-gray-600" : "bg-white/90 border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            {panel.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
