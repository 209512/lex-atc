import { useShallow } from 'zustand/react/shallow';
// src/components/sidebar/SidebarControlPanel.tsx
import React from 'react';
import clsx from 'clsx';
import { VolumeX, Speaker, Unlock, Lock, Eye, Activity, LayoutDashboard, SlidersHorizontal } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';

export const SidebarControlPanel = () => {
    const { state, triggerOverride, releaseLock, isAdminMuted, toggleAdminMute, playClick  } = useATCStore(useShallow(s => ({ state: s.state, triggerOverride: s.actions.triggerOverride, releaseLock: s.actions.releaseLock, isAdminMuted: s.isAdminMuted, toggleAdminMute: s.actions.toggleAdminMute, playClick: s.actions.playClick })));
    const { isDark, uiPreferences, updateUIPreferences  } = useUIStore(useShallow(s => ({ isDark: s.isDark, uiPreferences: s.uiPreferences, updateUIPreferences: s.updateUIPreferences })));
    
    const [isOverrideLoading, setIsOverrideLoading] = React.useState(false);
    const { viewMode } = uiPreferences;
    
    const isHuman = (state.holder && state.holder.includes('Human')) || state.overrideSignal;
    
    const handleOverride = async () => {
        if (isOverrideLoading || isHuman) return;
        
        setIsOverrideLoading(true);
        try {
            await triggerOverride();
        } catch (e) {
            console.error("Override Failed", e);
        } finally {
            setIsOverrideLoading(false);
        }
    };

    const handleRelease = async () => {
        try {
            await releaseLock();
        } catch (e) {
            console.error("Release Failed", e);
        }
    };

    const handleMuteToggle = () => {
        playClick?.();
        toggleAdminMute();
    };

    return (
        <div className={clsx(
            "p-2.5 border-b z-20 relative shrink-0 grid grid-cols-[auto_1fr_auto] gap-1 h-20 items-center min-w-0",
            isDark ? "border-gray-800 bg-gray-900/50" : "border-slate-200 bg-slate-50/50"
        )}>
        
            {/* AUDIO CONTROL */}
            <div className="flex flex-col gap-1 min-w-0">
                <Tooltip content={isAdminMuted ? "Unmute All" : "Mute All"} position="bottom">
                    <button 
                        onClick={handleMuteToggle}
                        className={clsx(
                            "h-[60px] w-14 rounded flex flex-col items-center justify-center gap-1 transition-all border min-w-0",
                            isAdminMuted 
                                ? (isDark ? "bg-red-900/20 border-red-800/50 text-red-400" : "bg-red-50 border-red-200 text-red-500")
                                : (isDark ? "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300" : "bg-white border-slate-300 hover:bg-slate-50 text-slate-600 shadow-sm")
                        )}
                    >
                        {isAdminMuted ? <VolumeX size={16} /> : <Speaker size={16} />}
                        <span className="text-[9px] font-bold uppercase tracking-tighter">Audio</span>
                    </button>
                </Tooltip>
            </div>

            {/* OVERRIDE CONTROL */}
            <div className="flex items-center h-full min-w-0 tour-step-emergency">
                {isHuman ? (
                    <button 
                        onClick={handleRelease} 
                        data-testid="btn-release-lock"
                        className="h-[60px] w-full rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-[10px] flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-900/20 transition-all active:scale-95 uppercase tracking-wider"
                    >
                        <Unlock size={16} />
                        <span>Release Lock</span>
                    </button>
                ) : (
                    <Tooltip content="Force Manual Control" position="bottom" className="w-full h-full">
                        <button 
                            onClick={handleOverride} 
                            disabled={isOverrideLoading} 
                            data-testid="btn-emergency-takeover"
                            className={clsx(
                                "h-[60px] w-full rounded font-bold text-[10px] flex flex-col items-center justify-center gap-1 shadow-lg transition-all active:scale-95 uppercase tracking-wider",
                                isOverrideLoading 
                                    ? "bg-gray-600 cursor-wait opacity-50"
                                    : "bg-red-500 hover:bg-red-600 text-white shadow-red-900/20"
                            )}
                        >
                            {isOverrideLoading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Lock size={16} />
                                    <span>Emergency Takeover</span>
                                </>
                            )}
                        </button>
                    </Tooltip>
                )}
            </div>

            {/* VIEW MODE TOGGLE */}
            <div className="flex flex-col gap-1 min-w-0">
                <Tooltip content="Switch View Mode" position="bottom-left">
                    <button 
                        onClick={() => {
                            playClick?.();
                            const modes = ['operator', 'executive', 'focus'] as const;
                            const nextIndex = (modes.indexOf(viewMode) + 1) % modes.length;
                            updateUIPreferences({ viewMode: modes[nextIndex] });
                        }}
                        className={clsx(
                            "h-[60px] w-14 rounded flex flex-col items-center justify-center gap-1 transition-all border min-w-0",
                            isDark ? "bg-blue-900/20 border-blue-800/50 text-blue-400 hover:bg-blue-800/30" : "bg-blue-50 border-blue-200 text-blue-500 hover:bg-blue-100"
                        )}
                    >
                        {viewMode === 'operator' && <Activity size={16} />}
                        {viewMode === 'executive' && <LayoutDashboard size={16} />}
                        {viewMode === 'focus' && <Eye size={16} />}
                        <span className="text-[8px] font-bold uppercase tracking-tighter truncate w-full px-1 text-center">
                            {viewMode}
                        </span>
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};
