// src/components/layout/SidebarContainer.tsx
import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useSidebarResize } from '@/hooks/system/useSidebarResize';
import { useModalStore } from '@/store/ui/modalStore';
import { useATCStore } from '@/store/atc';

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
import { SidebarSections } from '@/components/layout/sidebar/SidebarSections';
import { SidebarFooter } from '@/components/layout/sidebar/SidebarFooter';

export const SidebarContainer = () => {
    const { sidebarWidth, setSidebarWidth, isDark, uiPreferences, updateSidebarPreferences, updateUIPreferences } = useUIStore(useShallow(s => ({
        sidebarWidth: s.sidebarWidth,
        setSidebarWidth: s.setSidebarWidth,
        isDark: s.isDark,
        uiPreferences: s.uiPreferences,
        updateSidebarPreferences: s.updateSidebarPreferences,
        updateUIPreferences: s.updateUIPreferences
    })));
    const { setPolicyModalOpen } = useModalStore(useShallow(s => ({ setPolicyModalOpen: s.setPolicyModalOpen })));
    const { globalStop, toggleGlobalStop } = useATCStore(useShallow(s => ({ globalStop: !!s.state?.globalStop, toggleGlobalStop: s.toggleGlobalStop })));
    const [uptime, setUptime] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const lastExpandedWidth = useRef(450);
    const forcedFocusRail = useRef(false);
    
    const { sidebarRef, isResizing, handleMouseDown } = useSidebarResize(sidebarWidth, setSidebarWidth);

    useEffect(() => {
        const timer = setInterval(() => setUptime(u => u + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const isHidden = sidebarWidth <= 0;
    const isCollapsed = sidebarWidth > 0 && sidebarWidth <= 100;
    const { viewMode } = uiPreferences;

    useEffect(() => {
        if (sidebarWidth > 100) lastExpandedWidth.current = sidebarWidth;
    }, [sidebarWidth]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isMobile = window.innerWidth < 768;
        if (isMobile) return;
        if (viewMode === 'focus') {
            if (sidebarWidth > 100) {
                forcedFocusRail.current = true;
                setSidebarWidth(72);
            }
            return;
        }
        if (forcedFocusRail.current && sidebarWidth === 72 && lastExpandedWidth.current > 100) {
            forcedFocusRail.current = false;
            setSidebarWidth(lastExpandedWidth.current);
        }
    }, [viewMode, sidebarWidth, setSidebarWidth]);

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
                            <SidebarSections
                                isDark={isDark}
                                globalStop={globalStop}
                                sectionOrder={sectionOrder}
                                sections={sections}
                                onToggleSection={handleToggleSection}
                                onMoveSection={handleMoveSection}
                                onOpenPolicyTemplates={() => setPolicyModalOpen(true)}
                                onToggleGlobalStop={toggleGlobalStop}
                            />
                        </div>
                    )}

                    <SidebarFooter isDark={isDark} uptime={uptime} onCollapseToRail={() => setSidebarWidth(72)} />
                </div>

                {isCollapsed && (
                    <SidebarCompactRail 
                        onExpand={() => {
                            if (uiPreferences.viewMode === 'focus') updateUIPreferences({ viewMode: 'operator' });
                            setSidebarWidth(lastExpandedWidth.current);
                        }} 
                        onOpenSettings={() => setIsSettingsOpen(true)} 
                    />
                )}
            </aside>

            {isHidden && (
                <button
                    aria-label="사이드바 펼치기"
                    onClick={() => setSidebarWidth(450)}
                    className={clsx(
                        "fixed top-16 right-4 z-[60] pointer-events-auto rounded-lg border px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] shadow-xl",
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
