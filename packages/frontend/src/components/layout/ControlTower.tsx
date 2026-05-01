// src/components/layout/ControlTower.tsx
import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { TerminalLog } from '@/components/monitoring/terminal/TerminalLog';
import { QueueDisplay } from '@/components/monitoring/queue/QueueDisplay';
import { TacticalPanel } from '@/components/command/TacticalPanel';
import { SlashingHeatmap } from '@/components/monitoring/heatmap/SlashingHeatmap';
import { DisputeContextPanel } from '@/components/monitoring/heatmap/DisputeContextPanel';
import { SmartAlerts } from '@/components/monitoring/alerts/SmartAlerts';
import { useUIStore } from '@/store/ui';
import { useATCStore } from '@/store/atc';
import clsx from 'clsx';

export const ControlTower = () => {
    const { sidebarWidth, isDark, uiPreferences, updateFloatingPanel, bringToFront } = useUIStore(useShallow(s => ({ sidebarWidth: s.sidebarWidth, isDark: s.isDark, uiPreferences: s.uiPreferences, updateFloatingPanel: s.updateFloatingPanel, bringToFront: s.bringToFront })));
    const { state, agents } = useATCStore();
    const { viewMode } = uiPreferences;

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

    const [dismissedEventIds, setDismissedEventIds] = React.useState<{ dispute?: string | null; slash?: string | null }>({});

    const { recentDisputeEvent, recentSlashEvent } = React.useMemo(() => {
        const logsArray = state?.logs || [];
        const now = Date.now();

        const findRecent = (actionKey: string, windowMs: number) => {
            for (let i = logsArray.length - 1; i >= 0; i -= 1) {
                const log = logsArray[i];
                if (log.actionKey !== actionKey) continue;
                const logTime = new Date(log.timestamp).getTime();
                if ((now - logTime) < windowMs) return log;
                return null;
            }
            return null;
        };

        return {
            recentDisputeEvent: findRecent('SETTLEMENT_DISPUTE', 10000),
            recentSlashEvent: findRecent('SETTLEMENT_SLASH', 15000),
        };
    }, [state?.logs]);

    const heatmapProps = React.useMemo(() => {
        if (!recentSlashEvent) return null;
        const agentId = recentSlashEvent.agentId || recentSlashEvent.meta?.agentId || 'UNKNOWN';
        const agent = agents.find(a => a.id === agentId || a.uuid === agentId);
        
        return {
            agentId,
            metrics: {
                latency: agent?.metrics?.latency || 0,
                conflictRate: recentSlashEvent.meta?.metrics?.conflictRate ?? Math.min(100, Number(agent?.metrics?.collisions || 0)),
                balanceDrain: recentSlashEvent.meta?.metrics?.balanceDrain ?? ((agent?.account?.balance || 0) < 5000 ? ((10000 - (agent?.account?.balance || 0)) / 10000) * 100 : 0),
                anomalyScore: recentSlashEvent.meta?.metrics?.anomalyScore ?? (agent?.metrics?.anomalyScore || 0.92),
                arweaveTxId: recentSlashEvent.meta?.arweaveTxId
            }
        };
    }, [recentSlashEvent, agents]);

    const disputeProps = React.useMemo(() => {
        if (!recentDisputeEvent) return null;
        const msg = String(recentDisputeEvent.message || '');
        const m = msg.match(/FOR\s+(.+)$/i);
        const channelIdFromMessage = m?.[1]?.trim()?.toLowerCase();
        const channels = (state as any)?.settlement?.channels || [];
        const ch = channelIdFromMessage
            ? channels.find((c: any) => String(c?.channelId || '').toLowerCase() === channelIdFromMessage)
            : null;
        const channelId = ch?.channelId || channelIdFromMessage || 'unknown';
        return {
            channelId,
            actorUuid: ch?.actorUuid,
            openedBy: ch?.openedBy,
            targetNonce: ch?.targetNonce ?? ch?.lastNonce,
            reason: ch?.reason,
        };
    }, [recentDisputeEvent, state]);

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
                    {(heatmapProps || disputeProps) && (
                        <div className="pointer-events-auto absolute top-24 right-6 z-50 flex flex-col gap-3">
                            {disputeProps && recentDisputeEvent && dismissedEventIds.dispute !== recentDisputeEvent.id && (
                                <DisputeContextPanel
                                    channelId={disputeProps.channelId}
                                    actorUuid={disputeProps.actorUuid}
                                    openedBy={disputeProps.openedBy}
                                    targetNonce={disputeProps.targetNonce}
                                    reason={disputeProps.reason}
                                    isDark={isDark}
                                    isVisible={true}
                                    onClose={() => setDismissedEventIds((prev) => ({ ...prev, dispute: recentDisputeEvent.id }))}
                                />
                            )}
                            {heatmapProps && recentSlashEvent && dismissedEventIds.slash !== recentSlashEvent.id && (
                                <SlashingHeatmap
                                    agentId={heatmapProps.agentId}
                                    metrics={heatmapProps.metrics}
                                    isVisible={true}
                                    onClose={() => setDismissedEventIds((prev) => ({ ...prev, slash: recentSlashEvent.id }))}
                                />
                            )}
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
