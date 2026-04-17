// src/components/sidebar/SidebarHeader.tsx
import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import clsx from 'clsx';
import { ShieldAlert, Activity, Settings, EyeOff, Moon, Sun, Eye } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { ThemeType } from '@/contexts/uiPreferences';

export const SidebarHeader = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
    const { state  } = useATCStore(useShallow(s => ({ state: s.state })));
    const { isDark, setIsDark, setSidebarWidth, uiPreferences, updateUIPreferences  } = useUIStore(useShallow(s => ({ isDark: s.isDark, setIsDark: s.setIsDark, setSidebarWidth: s.setSidebarWidth, uiPreferences: s.uiPreferences, updateUIPreferences: s.updateUIPreferences })));
    const isHuman = state.holder && state.holder.includes('Human');
    const holderLabel = state.holder ? String(state.holder) : 'NONE';

    return (
        <div className={clsx(
            "p-4 border-b flex justify-between items-center transition-colors duration-500 min-w-0 shrink-0",
            isHuman ? "bg-red-500/10 border-red-500/30" : (isDark ? "border-gray-800" : "border-slate-200/40")
        )}>
            <div className="flex items-center gap-3">
                <div className={clsx("p-2 rounded-lg min-w-0", isHuman ? "bg-red-500 text-white animate-pulse" : (isDark ? "bg-gray-800 text-blue-400" : "bg-white text-blue-600 shadow-sm"))}>
                    {isHuman ? <ShieldAlert size={20} /> : <Activity size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                    <Tooltip content="Main Control Panel" position="bottom">
                        <h2 className="font-bold text-sm tracking-wide min-w-0" data-testid="traffic-control-title">
                            <span className="truncate block">TRAFFIC CONTROL</span>
                        </h2>
                    </Tooltip>
                    <div className="flex items-center gap-2 text-[10px] opacity-60 font-mono min-w-0">
                        <span className={clsx("w-1.5 h-1.5 rounded-full", isHuman ? "bg-red-500" : "bg-emerald-500")}></span>
                        <span className="shrink-0">{isHuman ? "MANUAL OVERRIDE" : "AUTONOMOUS"}</span>
                        <span className="opacity-40 truncate min-w-0">HOLDER: {holderLabel}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1 min-w-0">
                <Tooltip content="Hide Sidebar" position="bottom-left">
                    <button aria-label="사이드바 숨기기" onClick={() => setSidebarWidth(0)} className="p-2 rounded-md hover:bg-white/10">
                        <EyeOff size={16} />
                    </button>
                </Tooltip>
                <Tooltip content="Collapse to HUD Rail" position="bottom-left">
                    <button aria-label="HUD rail로 축소" onClick={() => setSidebarWidth(72)} className="p-2 rounded-md hover:bg-white/10">
                        <span className="sr-only">HUD rail로 축소</span>
                        <div className="w-3 h-3 border-l-2 border-current opacity-50" />
                    </button>
                </Tooltip>
                {/* 테마 버튼 툴팁 */}
                <Tooltip content="Toggle Theme" position="bottom-left">
                    <button onClick={() => {
                        const modes: ThemeType[] = ['dark', 'light', 'high-contrast'];
                        const next = modes[(modes.indexOf(uiPreferences.theme) + 1) % modes.length];
                        updateUIPreferences({ theme: next });
                        setIsDark(next === 'dark' || next === 'high-contrast');
                    }} className="p-2 rounded-md hover:bg-white/10 text-xs">
                        {uiPreferences.theme === 'dark' ? <Moon size={16} /> : uiPreferences.theme === 'light' ? <Sun size={16} /> : <Eye size={16} />}
                    </button>
                </Tooltip>
                {/* 설정 버튼 툴팁 */}
                <Tooltip content="System Settings" position="bottom-left">
                    <button onClick={onOpenSettings} className="p-2 rounded-md hover:bg-blue-500/20">
                        <Settings size={16} />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};
