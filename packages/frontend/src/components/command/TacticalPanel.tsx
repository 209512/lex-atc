// src/components/command/TacticalPanel.tsx
import React, { useRef, useState, useMemo } from 'react';
import Draggable from 'react-draggable';
import clsx from 'clsx';
import { ChevronDown, Radio, Play, Pause } from 'lucide-react';
import { TacticalItem } from '@/components/command/TacticalItem';
import { useTacticalActions } from '@/hooks/agent/useTacticalActions';
import { useCategorizedAgents } from '@/hooks/agent/useCategorizedAgents';
import { Agent } from '@/contexts/atcTypes';
import { Tooltip } from '@/components/common/Tooltip';
import { useClampFloatingPanel } from '@/hooks/system/useClampFloatingPanel';

import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';

export const TacticalPanel = () => {
    const { 
        isDark, state, renamingId, newName, setNewName, 
        handleStartRename, handleCancelRename, handleConfirmRename,
        onTransferLock, togglePriority, onTogglePause, terminateAgent,
        sidebarWidth: _sidebarWidth, globalStop, toggleGlobalStop, agents 
    } = useTacticalActions();
    const { priorityAgents } = useCategorizedAgents();
    const { uiPreferences, updateFloatingPanel, bringToFront } = useUIStore(useShallow(s => ({ 
        uiPreferences: s.uiPreferences, 
        updateFloatingPanel: s.updateFloatingPanel,
        bringToFront: s.bringToFront
    })));
    
    const [filterMode, setFilterMode] = useState<'all' | 'priority'>('all');
    const nodeRef = useRef(null);

    const panel = uiPreferences.panels.tactical || { x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 450 - 320 - 20) : 480, y: 20, isOpen: true, isCollapsed: false, width: 320, height: 600 };
    const isOpen = panel.isOpen !== false;
    const isCollapsed = panel.isCollapsed === true;
    const panelOrder = uiPreferences.panelOrder || [];
    const zIndex = 40 + (panelOrder.includes('tactical') ? panelOrder.indexOf('tactical') : panelOrder.length);

    useClampFloatingPanel('tactical', { width: Number(panel.width ?? 320), height: Number(panel.height ?? 600) });

    const activeCount = useMemo(() => {
        return agents.filter((a: Agent) => String(a.status).toLowerCase() !== 'paused' && !globalStop).length;
    }, [agents, globalStop]);

    const sortedTacticalList = useMemo(() => {
        if (filterMode === 'priority') return priorityAgents;

        return [...agents].sort((a, b) => 
            (a.displayId || a.id).localeCompare(b.displayId || b.id, undefined, { numeric: true })
        );
        
    }, [priorityAgents, filterMode, agents]);

    if (!isOpen) return null;

    return (
        <Draggable 
            nodeRef={nodeRef} 
            handle=".tactical-handle" 
            bounds="body"
            position={{ x: panel.x ?? 800, y: panel.y ?? 20 }}
            onStop={(e, data) => updateFloatingPanel('tactical', { x: data.x, y: data.y })}
            onMouseDown={() => bringToFront('tactical')}
        >
            <div ref={nodeRef} 
                data-testid="panel-tactical"
                className={clsx("fixed rounded-xl border shadow-2xl backdrop-blur-md flex flex-col overflow-hidden transition-colors pointer-events-auto", 
                isDark ? "bg-[#0d1117]/90 border-gray-800 text-gray-300" : "bg-slate-50/80 border-slate-200/40 text-slate-800",
                isCollapsed ? "!max-h-[40px] !h-10 w-80" : "resize both")}
                style={{ 
                    left: 0, 
                    top: 0,
                    zIndex,
                    width: isCollapsed ? 320 : (panel.width ?? 320),
                    height: isCollapsed ? 40 : (panel.height ?? 600),
                    minWidth: isCollapsed ? 320 : 280,
                    minHeight: isCollapsed ? 40 : 200,
                    maxWidth: '90vw',
                    maxHeight: '90vh'
                }}
                onMouseUp={(e) => {
                    const target = e.currentTarget;
                    if (target && !isCollapsed) {
                        const newWidth = target.offsetWidth;
                        const newHeight = target.offsetHeight;
                        if (newWidth !== panel.width || newHeight !== panel.height) {
                            updateFloatingPanel('tactical', { width: newWidth, height: newHeight });
                        }
                    }
                }}
            >
                
                <div className={clsx("p-3 border-b flex justify-between items-center tactical-handle cursor-move select-none shrink-0 h-10", 
                    isDark ? "bg-gray-800/20 border-gray-800" : "bg-white/40 border-slate-200/40")}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] font-mono">
                        <Radio size={14} className="text-blue-500" />
                        <Tooltip content="Active Node Engagement Control" position="bottom-right">
                            <span>Tactical Command</span>
                        </Tooltip>
                    </div>
                    <div className="flex items-center gap-1">
                        <Tooltip content={isCollapsed ? "Expand" : "Minimize"} position="bottom">
                            <button 
                            data-testid="btn-minimize-tactical"
                            onClick={() => updateFloatingPanel('tactical', { isCollapsed: !isCollapsed })} 
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            aria-label={isCollapsed ? "전술 창 펼치기" : "전술 창 접기"}
                        >
                            <ChevronDown size={14} className={clsx("transition-transform duration-300", !isCollapsed && "rotate-180")} />
                        </button>
                        </Tooltip>
                        <Tooltip content="Close" position="bottom">
                            <button 
                                data-testid="btn-close-tactical"
                                onClick={() => updateFloatingPanel('tactical', { isOpen: false })} 
                                className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors"
                                aria-label="전술 창 닫기"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 pb-2">
                        <div className="grid grid-cols-2 gap-2 mb-2 shrink-0">
                            <Tooltip content={globalStop ? "Resume All" : "Halt All"} position="bottom">
                                <button onClick={toggleGlobalStop}
                                    className={clsx("w-full p-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 border transition-all",
                                        globalStop ? "bg-red-500 text-white border-red-600 animate-pulse" : (isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-white border-slate-300")
                                    )}>
                                    {globalStop ? <Play size={12} /> : <Pause size={12} />}
                                    {globalStop ? "RESUME ALL" : "HALT ALL"}
                                </button>
                            </Tooltip>
                            <Tooltip content="Live Active / Total Nodes" position="bottom">
                                <div className={clsx("p-2 rounded text-[10px] font-mono flex flex-col items-center justify-center border",
                                    isDark ? "bg-gray-900 border-gray-800 text-gray-500" : "bg-slate-50 border-slate-200 text-slate-500")}>
                                    <span className="font-bold text-lg text-blue-500 leading-none">{activeCount} / {agents.length}</span>
                                </div>
                            </Tooltip>
                        </div>

                        <div className="flex p-0.5 rounded bg-black/10 border border-gray-500/10 mb-2">
                            <Tooltip content="Filter: All" position="bottom" className="flex-1">
                                <button onClick={() => setFilterMode('all')} className={clsx("w-full py-1 text-[9px] font-bold rounded", filterMode === 'all' ? "bg-blue-600 text-white" : "text-gray-500")}>ALL</button>
                            </Tooltip>
                            <Tooltip content="Filter: Priority" position="bottom" className="flex-1">
                                <button onClick={() => setFilterMode('priority')} className={clsx("w-full py-1 text-[9px] font-bold rounded", filterMode === 'priority' ? "bg-amber-500 text-white" : "text-gray-500")}>PRIORITY</button>
                            </Tooltip>
                        </div>

                        {sortedTacticalList.map((agent: Agent) => (
                            <TacticalItem 
                                key={`tactical-${agent.id}`} 
                                agent={agent}
                                state={state}
                                isDark={isDark}
                                renamingId={renamingId}
                                newName={newName}
                                setNewName={setNewName}
                                onStartRename={handleStartRename}
                                onConfirmRename={handleConfirmRename}
                                onCancelRename={handleCancelRename}
                                onTransferLock={onTransferLock}
                                togglePriority={togglePriority}
                                onTogglePause={onTogglePause}
                                terminateAgent={terminateAgent}
                            />
                        ))}
                    </div>
                )}
            </div>
        </Draggable>
    );
};
