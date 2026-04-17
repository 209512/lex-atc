import { useShallow } from 'zustand/react/shallow';
 import React, { useState, useMemo, useRef } from 'react';
import Draggable from 'react-draggable';
import clsx from 'clsx';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { TerminalHeader } from './TerminalHeader';
import { TerminalSidebar } from './TerminalSidebar';
import { TerminalFiltersBar } from './TerminalFiltersBar';
import { LogList } from './LogList';
import { matchesPrimaryFilter, knownActionGroups } from './logFilters';
import { TerminalAnalytics } from './TerminalAnalytics';
import { useClampFloatingPanel } from '@/hooks/system/useClampFloatingPanel';

export const TerminalLog = () => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const { state, agents, isAdminMuted, toggleAdminMute } = useATCStore(useShallow(s => ({
    state: s.state,
    agents: s.agents,
    isAdminMuted: s.isAdminMuted,
    toggleAdminMute: s.toggleAdminMute
  })));

  const { 
    isDark, 
    sidebarWidth: _sidebarWidth,
    uiPreferences,
    updateTerminalPreferences,
    restoreDefaultTerminalPreferences,
    updateFloatingPanel,
    bringToFront
  } = useUIStore(useShallow(s => ({ 
    isDark: s.isDark, 
    sidebarWidth: s.sidebarWidth,
    uiPreferences: s.uiPreferences,
    updateTerminalPreferences: s.updateTerminalPreferences,
    restoreDefaultTerminalPreferences: s.restoreDefaultTerminalPreferences,
    updateFloatingPanel: s.updateFloatingPanel,
    bringToFront: s.bringToFront
  })));
  
  const [activeTab, setActiveTab] = useState<'logs' | 'analytics'>('logs');

  const panel = uiPreferences.panels.terminal || { x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 450 - 420 - 20) : 20, y: 20, isOpen: true, isCollapsed: false, width: 420, height: 320 };
  const isOpen = panel.isOpen !== false;
  const isCollapsed = panel.isCollapsed === true;
  const panelOrder = uiPreferences.panelOrder || [];
  const zIndex = 40 + (panelOrder.includes('terminal') ? panelOrder.indexOf('terminal') : panelOrder.length);

  useClampFloatingPanel('terminal', { width: Number(panel.width ?? 420), height: Number(panel.height ?? 320) });

  const { filter, domainFilter, actionKeyFilter, showOnlyEconomy, autoScroll } = uiPreferences.terminal;

  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents.forEach(a => {
      map[a.id] = a.displayId || a.id;
    });
    return map;
  }, [agents]);

  const filteredLogs = useMemo(() => {
    const allLogs = state?.logs || [];
    return allLogs.filter(l => {
        if (showOnlyEconomy) return l.domain === 'economy';
        
        if (!matchesPrimaryFilter(filter, l)) return false;
        
        if (domainFilter !== 'ALL' && l.domain !== domainFilter.toLowerCase()) return false;
        
        if (actionKeyFilter !== 'ALL' && l.actionKey !== actionKeyFilter) return false;

        return true;
    });
  }, [state?.logs, filter, domainFilter, actionKeyFilter, showOnlyEconomy]);

  const saveLogs = () => {
      const content = (state?.logs || []).map(l => 
        `[${new Date(l.timestamp).toISOString()}] [${(l.type || 'INFO').toUpperCase()}] ${l.message}`
      ).join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atc_tactical_logs_${new Date().toISOString().slice(0,10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
      <Draggable 
          nodeRef={nodeRef} 
          handle=".handle" 
          bounds="body"
          position={{ x: panel.x ?? 20, y: panel.y ?? 500 }}
          onStop={(e, data) => updateFloatingPanel('terminal', { x: data.x, y: data.y })}
          onMouseDown={() => bringToFront('terminal')}
      >
            <div 
                ref={nodeRef}
                data-testid="panel-terminal"
                className="fixed flex flex-col items-end font-mono transition-colors duration-300 ease-out pointer-events-auto" 
                style={{ left: 0, top: 0, zIndex }}
            >
                <div 
                    className={clsx(
                        "rounded-lg border shadow-xl backdrop-blur-md flex flex-col text-xs overflow-hidden",
                        isDark ? "bg-[#0d1117]/90 border-gray-800 text-gray-300" : "bg-slate-50/80 border-slate-200/40 text-slate-800",
                        isCollapsed ? "!h-10 !min-h-[40px] !w-80" : "resize both"
                    )}
                    style={isCollapsed ? {} : {
                        width: panel.width ?? 420,
                        height: panel.height ?? 320,
                        minWidth: 320,
                        minHeight: 180,
                        maxWidth: '90vw',
                        maxHeight: '90vh'
                    }}
                    onMouseUp={(e) => {
                        // Capture resize events
                        const target = e.currentTarget;
                        if (target && !isCollapsed) {
                            const newWidth = target.offsetWidth;
                            const newHeight = target.offsetHeight;
                            if (newWidth !== panel.width || newHeight !== panel.height) {
                                updateFloatingPanel('terminal', { width: newWidth, height: newHeight });
                            }
                        }
                    }}
                >
                    <TerminalHeader 
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        showOnlyEconomy={showOnlyEconomy}
                        updateTerminalPreferences={updateTerminalPreferences}
                        saveLogs={saveLogs}
                        autoScroll={autoScroll}
                        isAdminMuted={isAdminMuted}
                        toggleAdminMute={toggleAdminMute}
                        restoreDefaultTerminalPreferences={restoreDefaultTerminalPreferences}
                        isCollapsed={isCollapsed}
                        toggleCollapsed={() => updateFloatingPanel('terminal', { isCollapsed: !isCollapsed })}
                        onClose={() => updateFloatingPanel('terminal', { isOpen: false })}
                        isDark={isDark}
                    />

                    {!isCollapsed && (
                        <div className="flex flex-1 overflow-hidden relative">
                            {activeTab === 'logs' ? (
                                <>
                                    <TerminalSidebar 
                                        filter={filter}
                                        showOnlyEconomy={showOnlyEconomy}
                                        updateTerminalPreferences={updateTerminalPreferences}
                                        isDark={isDark}
                                    />
                                    <div className="flex-1 flex flex-col min-w-0">
                                        <TerminalFiltersBar 
                                            filteredLogsCount={filteredLogs.length}
                                            totalLogsCount={state?.logs?.length || 0}
                                            actionKeyFilter={actionKeyFilter}
                                            updateTerminalPreferences={updateTerminalPreferences}
                                            actionFilterGroups={Object.entries(knownActionGroups).map(([domain, actions]) => ({ domain, actions }))}
                                            domainFilter={domainFilter}
                                            isDark={isDark}
                                        />
                                        <LogList 
                                            logs={filteredLogs}
                                            isDark={isDark}
                                            isCollapsed={isCollapsed}
                                            panelHeight={260}
                                            autoScroll={autoScroll}
                                            onAutoScrollChange={(v) => updateTerminalPreferences({ autoScroll: v })}
                                            agentNameMap={agentNameMap}
                                        />
                                    </div>
                                </>
                            ) : (
                                <TerminalAnalytics logs={state?.logs || []} isDark={isDark} />
                            )}
                        </div>
                    )}
                </div>
            </div>
      </Draggable>
  );
};
