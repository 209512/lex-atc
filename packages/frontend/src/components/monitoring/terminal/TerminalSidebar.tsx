import React from 'react';
import clsx from 'clsx';
import { Tooltip } from '@/components/common/Tooltip';

interface TerminalSidebarProps {
  filter: string;
  showOnlyEconomy: boolean;
  updateTerminalPreferences: (prefs: any) => void;
  isDark: boolean;
}

export const TerminalSidebar: React.FC<TerminalSidebarProps> = ({ filter, showOnlyEconomy, updateTerminalPreferences, isDark }) => {
  return (
    <div className={clsx(
        "w-10 border-r flex flex-col items-center py-2 gap-1.5 shrink-0 overflow-y-auto scrollbar-hide", 
        isDark ? "bg-black/20 border-gray-800" : "bg-white/10 border-slate-200"
    )} style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
        {[
          { label: 'ALL', value: 'ALL' },
          { label: 'INFO', value: 'info' },
          { label: 'WARN', value: 'warn' },
          { label: 'LOCK', value: 'lock' },
          { label: 'SYS', value: 'system' },
          { label: 'PLC', value: 'policy' },
          { label: 'CRIT', value: 'critical' },
          { label: 'REQ', value: 'request' },
          { label: 'ACK', value: 'accepted' },
          { label: 'DONE', value: 'executed' },
          { label: 'FAIL', value: 'failed' },
        ].map(({ label, value }) => {
            const isActive = !showOnlyEconomy && filter.toLowerCase() === String(value).toLowerCase();
            
            return (
                <Tooltip key={label} content={`Filter: ${label}`} position="right">
                    <button 
                        aria-label={`Terminal type filter ${value}`}
                        onClick={() => { updateTerminalPreferences({ filter: value, showOnlyEconomy: false }); }} 
                        className={clsx(
                            "text-[9px] font-bold w-6 h-6 flex items-center justify-center rounded transition-colors", 
                            isActive ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        {label[0]}
                    </button>
                </Tooltip>
            );
        })}
    </div>
  );
};
