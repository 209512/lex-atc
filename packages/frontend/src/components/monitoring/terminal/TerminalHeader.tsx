import React from 'react';
import clsx from 'clsx';
import { Volume2, VolumeX, ArrowDownCircle, ChevronDown, Save } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';

interface TerminalHeaderProps {
  activeTab: 'logs' | 'analytics';
  setActiveTab: (tab: 'logs' | 'analytics') => void;
  showOnlyEconomy: boolean;
  updateTerminalPreferences: (prefs: any) => void;
  saveLogs: () => void;
  autoScroll: boolean;
  isAdminMuted: boolean;
  toggleAdminMute: () => void;
  restoreDefaultTerminalPreferences: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onClose?: () => void;
  isDark: boolean;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  activeTab, setActiveTab, showOnlyEconomy, updateTerminalPreferences,
  saveLogs, autoScroll, isAdminMuted, toggleAdminMute,
  restoreDefaultTerminalPreferences, isCollapsed, toggleCollapsed, onClose, isDark
}) => {
  return (
    <div className={clsx("flex justify-between items-center p-2 border-b handle cursor-move h-10 shrink-0 w-full",
        isDark ? "bg-gray-800/20 border-gray-800" : "bg-white/40 border-slate-200/40"
    )}>
        <Tooltip content="Tactical Event Stream" position="bottom-right">
            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2 select-none">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                <div className="flex bg-black/20 rounded p-0.5">
                    <button 
                        onClick={() => setActiveTab('logs')}
                        className={clsx("px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded transition-colors", activeTab === 'logs' ? "bg-blue-500 text-white" : "text-gray-500 hover:text-gray-300")}
                    >
                        LOGS
                    </button>
                    <button 
                        onClick={() => setActiveTab('analytics')}
                        className={clsx("px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded transition-colors", activeTab === 'analytics' ? "bg-purple-500 text-white" : "text-gray-500 hover:text-gray-300")}
                    >
                        ANALYTICS
                    </button>
                </div>
            </div>
        </Tooltip>

        <div className="flex items-center gap-2 shrink-0">
             {!isCollapsed && (
                 <>
                    <Tooltip content="Show economy events" position="bottom">
                        <button 
                            aria-label="Terminal economy filter"
                            onClick={() => updateTerminalPreferences({ showOnlyEconomy: !showOnlyEconomy })}
                            className={clsx(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all mr-1",
                                showOnlyEconomy ? "bg-yellow-500/20 border-yellow-500 text-yellow-500" : "border-transparent text-gray-500 hover:bg-white/10"
                            )}
                        >💰 ECON</button>
                    </Tooltip>

                    <Tooltip content="Save Logs" position="bottom">
                        <button onClick={saveLogs} className="p-1 rounded hover:bg-white/10 text-gray-500"><Save size={13} /></button>
                    </Tooltip>
                    <Tooltip content={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"} position="bottom">
                        <button aria-label="Terminal auto scroll" onClick={() => updateTerminalPreferences({ autoScroll: !autoScroll })} className={clsx("p-1 rounded", autoScroll ? "text-green-500" : "text-gray-500")}><ArrowDownCircle size={13} /></button>
                    </Tooltip>
                    <Tooltip content={isAdminMuted ? "Unmute All" : "Mute All"} position="bottom">
                        <button onClick={toggleAdminMute} className="p-1 rounded text-gray-500">{isAdminMuted ? <VolumeX size={13} className="text-red-500" /> : <Volume2 size={13} />}</button>
                    </Tooltip>
                    <Tooltip content="Reset persisted terminal filters and size" position="bottom">
                        <button aria-label="Terminal reset" onClick={restoreDefaultTerminalPreferences} className="rounded border px-1.5 py-0.5 text-[9px] font-bold border-white/10 text-gray-400 hover:bg-white/5">RESET</button>
                    </Tooltip>
                 </>
             )}
            <Tooltip content={isCollapsed ? "Activity feed 펼치기" : "Activity feed 접기"} position="bottom">
                <button aria-label={isCollapsed ? "Activity feed 펼치기" : "Activity feed 접기"} data-testid="btn-minimize-terminal" onClick={toggleCollapsed} className={clsx("p-1 rounded hover:bg-white/10 transition-transform", !isCollapsed && "rotate-180")}><ChevronDown size={14} /></button>
            </Tooltip>
            {onClose && (
                <Tooltip content="터미널 창 닫기" position="bottom">
                    <button data-testid="btn-close-terminal" onClick={onClose} className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </Tooltip>
            )}
        </div>
    </div>
  );
};
