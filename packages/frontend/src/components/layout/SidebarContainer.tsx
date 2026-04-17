import { useShallow } from 'zustand/react/shallow';
// src/components/layout/SidebarContainer.tsx
import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';
import { useSidebarResize } from '@/hooks/system/useSidebarResize';

import { SidebarHeader } from '@/components/sidebar/SidebarHeader';
import { SidebarControlPanel } from '@/components/sidebar/SidebarControlPanel';
import { SystemStats } from '@/components/sidebar/SystemStats';
import { AgentList } from '@/components/sidebar/AgentList';
import { AgentSettings } from '@/components/sidebar/AgentSettings';
import { L4StatusPanel } from '@/components/sidebar/L4StatusPanel';
import { OperationsPanel } from '@/components/sidebar/OperationsPanel';
import { SidebarSection } from '@/components/sidebar/SidebarSection';
import { SidebarCompactRail } from '@/components/sidebar/SidebarCompactRail';
import { SidebarSectionKey } from '@/contexts/uiPreferences';

const formatUptime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const SECTION_TITLES: Record<SidebarSectionKey, string> = {
    overview: 'System Overview',
    l4: 'L4 Monitoring',
    ops: 'Operations',
    agents: 'Agents'
};

const SECTION_SUBTITLES: Record<SidebarSectionKey, string> = {
    overview: 'capacity · radar · local overview',
    l4: 'status guide · hot items · axes',
    ops: 'governance · isolation · settlement',
    agents: 'identity · queue · tactical controls'
};

export const SidebarContainer = () => {
    const { sidebarWidth, setSidebarWidth, isDark, uiPreferences, updateSidebarPreferences } = useUIStore(useShallow(s => ({
        sidebarWidth: s.sidebarWidth,
        setSidebarWidth: s.setSidebarWidth,
        isDark: s.isDark,
        uiPreferences: s.uiPreferences,
        updateSidebarPreferences: s.updateSidebarPreferences
    })));
    const [uptime, setUptime] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const { sidebarRef, isResizing, handleMouseDown } = useSidebarResize(sidebarWidth, setSidebarWidth);

    useEffect(() => {
        const timer = setInterval(() => setUptime(u => u + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const isHidden = sidebarWidth <= 0;
    const isCollapsed = sidebarWidth > 0 && sidebarWidth <= 100;
    const { viewMode } = uiPreferences;

    const { sectionOrder, sections } = uiPreferences.sidebar;

    const handleToggleSection = (key: SidebarSectionKey) => {
        updateSidebarPreferences({
            sections: { ...sections, [key]: !sections[key] }
        });
    };

    const handleMoveSection = (idx: number, dir: 1 | -1) => {
        const newOrder = [...sectionOrder];
        const temp = newOrder[idx];
        newOrder[idx] = newOrder[idx + dir];
        newOrder[idx + dir] = temp;
        updateSidebarPreferences({ sectionOrder: newOrder });
    };

    const renderSection = (key: SidebarSectionKey, idx: number) => {
        const props = {
            title: SECTION_TITLES[key],
            subtitle: SECTION_SUBTITLES[key],
            isDark,
            isOpen: sections[key],
            onToggle: () => handleToggleSection(key),
            onMoveUp: () => handleMoveSection(idx, -1),
            onMoveDown: () => handleMoveSection(idx, 1),
            disableMoveUp: idx === 0,
            disableMoveDown: idx === sectionOrder.length - 1
        };

        switch (key) {
            case 'overview': return <SidebarSection key={key} {...props}><SystemStats /></SidebarSection>;
            case 'l4': return <SidebarSection key={key} {...props}><L4StatusPanel /></SidebarSection>;
            case 'ops': return <SidebarSection key={key} {...props}><OperationsPanel /></SidebarSection>;
            case 'agents': return <SidebarSection key={key} {...props}><AgentList /></SidebarSection>;
            default: return null;
        }
    };

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const getSidebarStyle = () => {
        if (isMobile) {
            return {
                height: isHidden ? '0px' : (isCollapsed ? '60px' : '60vh'),
                width: '100%',
                position: 'fixed' as const,
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                transition: 'height 0.3s ease-in-out'
            };
        }
        return { 
            width: isHidden ? '0px' : (isCollapsed ? '72px' : `${sidebarWidth}px`) 
        };
    };

    return (
        <>
            <aside 
            ref={sidebarRef}
            className={clsx(
                "h-full md:h-screen border-t md:border-t-0 md:border-l flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.3)] md:shadow-2xl backdrop-blur-md z-50 pointer-events-auto shrink-0 transform-none",
                "w-full md:w-auto md:relative",
                isDark ? "bg-[#0d1117]/95 border-gray-800 text-gray-300" : "bg-slate-50/95 border-slate-200/40 text-slate-800",
                !isResizing && "transition-all duration-300"
            )}
            style={getSidebarStyle()}
        >
                {isMobile && !isHidden && (
                    <div 
                        className="w-full h-6 flex items-center justify-center cursor-pointer active:bg-white/5"
                        onClick={() => setSidebarWidth(isCollapsed ? 320 : 72)}
                    >
                        <div className={clsx("w-12 h-1.5 rounded-full opacity-30", isDark ? "bg-white" : "bg-black")} />
                    </div>
                )}

                {!isHidden && !isMobile && (
                    <div 
                        onMouseDown={handleMouseDown}
                        className="absolute top-0 bottom-0 left-[-8px] w-4 cursor-col-resize z-[60] group"
                    >
                        <div className={clsx(
                            "absolute right-[7px] top-0 bottom-0 w-[1.5px] transition-colors",
                            isResizing ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "group-hover:bg-blue-500/50 bg-transparent"
                        )} />
                    </div>
                )}

                <div className={clsx("flex flex-col h-full w-full", (isCollapsed || isHidden) ? "hidden" : "flex")}>
                    <SidebarHeader onOpenSettings={() => setIsSettingsOpen(true)} />
                    <SidebarControlPanel />

                    {viewMode === 'focus' ? (
                        <div className="flex-1 flex items-center justify-center text-center opacity-50 p-4 font-mono text-xs">
                            FOCUS MODE<br/>Sidebar content is minimized.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 min-w-0">
                            {sectionOrder.map((key, idx) => renderSection(key, idx))}
                        </div>
                    )}

                    <div className={clsx(
                        "p-3 border-t text-[10px] font-mono flex justify-between items-center gap-4 min-w-0 shrink-0",
                        isDark ? "border-gray-800 bg-[#0b0e14] text-gray-600" : "border-slate-200 bg-white text-slate-400"
                    )}>
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                SYSTEM_READY
                            </span>
                            <span className="opacity-50 select-none text-[8px] truncate hidden sm:inline">v2.4.0-RC</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                            <button aria-label="HUD rail로 축소" onClick={() => setSidebarWidth(72)} className="hover:text-gray-300">
                                ◁
                            </button>
                            <span className="tabular-nums font-bold">UPTIME: {formatUptime(uptime)}</span>
                        </div>
                    </div>
                </div>

                {isCollapsed && (
                    <SidebarCompactRail 
                        onExpand={() => setSidebarWidth(450)} 
                        onOpenSettings={() => setIsSettingsOpen(true)} 
                    />
                )}
            </aside>

            {isHidden && (
                <button
                    aria-label="사이드바 펼치기"
                    onClick={() => setSidebarWidth(450)}
                    className={clsx(
                        "fixed top-4 right-4 z-[60] pointer-events-auto rounded-lg border px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] shadow-xl",
                        isDark ? "bg-[#0d1117]/90 border-gray-800 text-gray-200 hover:bg-[#0d1117]" : "bg-white/90 border-slate-200 text-slate-800 hover:bg-slate-50"
                    )}
                    data-testid="btn-sidebar-reveal"
                >
                    Sidebar
                </button>
            )}

            {isSettingsOpen && (
                <AgentSettings onClose={() => setIsSettingsOpen(false)} />
            )}
        </>
    );
};
