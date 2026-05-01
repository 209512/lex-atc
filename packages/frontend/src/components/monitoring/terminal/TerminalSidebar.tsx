import React, { useRef } from 'react';
import clsx from 'clsx';
import { Tooltip } from '@/components/common/Tooltip';

interface TerminalSidebarProps {
  filter: string;
  showOnlyEconomy: boolean;
  excludedFilters: string[];
  updateTerminalPreferences: (prefs: any) => void;
  isDark: boolean;
}

export const TerminalSidebar: React.FC<TerminalSidebarProps> = ({ filter, showOnlyEconomy: _showOnlyEconomy, excludedFilters, updateTerminalPreferences, isDark }) => {
  const prevFilterRef = useRef<string>('ALL');
  const safeExcluded = Array.isArray(excludedFilters) ? excludedFilters : [];

  const toggleBlacklist = (value: string) => {
    if (String(value).toUpperCase() === 'ALL') return;
    const exists = safeExcluded.some((v) => String(v).toLowerCase() === String(value).toLowerCase());
    const next = exists ? safeExcluded.filter((v) => String(v).toLowerCase() !== String(value).toLowerCase()) : [...safeExcluded, value];
    updateTerminalPreferences({ excludedFilters: next, filter: prevFilterRef.current });
  };

  return (
    <div className={clsx(
        "w-10 border-r flex flex-col items-center py-2 gap-1.5 shrink-0 overflow-y-auto scrollbar-hide", 
        isDark ? "bg-black/20 border-gray-800" : "bg-white/10 border-slate-200"
    )}>
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
            const isActive = filter.toLowerCase() === String(value).toLowerCase();
            const isBlacklisted = !isActive && String(value).toUpperCase() !== 'ALL' && safeExcluded.some((v) => String(v).toLowerCase() === String(value).toLowerCase());
            
            return (
                <Tooltip key={label} content={`Filter: ${label}`} position="right">
                    <button 
                        aria-label={`Terminal type filter ${value}`}
                        onClick={() => {
                          prevFilterRef.current = filter;
                          updateTerminalPreferences({ filter: value });
                        }}
                        onDoubleClick={() => toggleBlacklist(String(value))}
                        className={clsx(
                            "text-[9px] font-bold w-6 h-6 flex items-center justify-center rounded transition-colors", 
                            isActive ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-white/5",
                            isBlacklisted && "blacklist-hatch ring-1 ring-white/10"
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
