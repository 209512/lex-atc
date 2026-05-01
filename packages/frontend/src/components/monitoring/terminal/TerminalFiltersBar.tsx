import React, { useRef } from 'react';
import clsx from 'clsx';
import { domainFilterOptions } from './logFilters';
import type { LogDomain } from '@/contexts/atcTypes';

interface TerminalFiltersBarProps {
  filteredLogsCount: number;
  totalLogsCount: number;
  actionKeyFilter: string;
  updateTerminalPreferences: (prefs: any) => void;
  actionFilterGroups: {domain: string, actions: string[]}[];
  domainFilter: string;
  excludedDomains: LogDomain[];
  isDark: boolean;
}

export const TerminalFiltersBar: React.FC<TerminalFiltersBarProps> = ({
  filteredLogsCount,
  totalLogsCount,
  actionKeyFilter,
  updateTerminalPreferences,
  actionFilterGroups,
  domainFilter,
  excludedDomains,
  isDark
}) => {
  const prevDomainRef = useRef<string>('ALL');
  const safeExcluded = Array.isArray(excludedDomains) ? excludedDomains : [];

  const toggleBlacklist = (value: string) => {
    if (String(value).toUpperCase() === 'ALL') return;
    const exists = safeExcluded.some((d) => String(d) === String(value));
    const next = exists ? safeExcluded.filter((d) => String(d) !== String(value)) : [...safeExcluded, value as LogDomain];
    updateTerminalPreferences({ excludedDomains: next, domainFilter: prevDomainRef.current });
  };

  return (
    <div className={clsx("border-b px-2 py-1.5", isDark ? "border-gray-800 bg-black/20" : "border-slate-200 bg-white/40")}>
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 flex-nowrap overflow-x-auto min-w-0 scrollbar-hide">
                {domainFilterOptions.map((option) => {
                    const isActive = String(domainFilter) === String(option.value);
                    const isBlacklisted = !isActive && String(option.value).toUpperCase() !== 'ALL' && safeExcluded.some((d) => String(d) === String(option.value));
                    const btn = (
                        <button
                            key={option.value}
                            aria-label={`Terminal domain filter ${option.value}`}
                            onClick={() => {
                              prevDomainRef.current = domainFilter;
                              updateTerminalPreferences({ domainFilter: option.value });
                            }}
                            onDoubleClick={() => toggleBlacklist(String(option.value))}
                            className={clsx(
                                "rounded px-2 py-1 text-[9px] font-mono font-bold transition-colors shrink-0",
                                isActive
                                    ? "bg-blue-600 text-white"
                                    : (isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-slate-100 text-slate-500 hover:bg-slate-200"),
                                isBlacklisted && "blacklist-hatch ring-1 ring-white/10"
                            )}
                        >
                            {option.label}
                        </button>
                    );

                    if (option.label === 'ECO') {
                        return (
                            <React.Fragment key={option.value}>
                                {btn}
                                <div className={clsx("text-[9px] font-mono uppercase tracking-[0.12em] tabular-nums shrink-0", isDark ? "text-gray-500" : "text-slate-500")}>
                                    {filteredLogsCount}/{totalLogsCount} logs
                                </div>
                            </React.Fragment>
                        );
                    }

                    return btn;
                })}
            </div>

            <div className="flex-1" />

            <select
                aria-label="Terminal action filter"
                value={actionKeyFilter}
                onChange={(event) => updateTerminalPreferences({ actionKeyFilter: event.target.value })}
                className={clsx("rounded border px-2 py-1 text-[9px] font-mono outline-none shrink-0", isDark ? "border-white/10 bg-black/30 text-gray-300" : "border-slate-200 bg-white text-slate-700")}
            >
                <option value="ALL">ALL ACTIONS</option>
                {actionFilterGroups.map((group) => (
                    <optgroup key={group.domain} label={group.domain.toUpperCase()}>
                        {group.actions.map((action) => (
                            <option key={`${group.domain}-${action}`} value={action}>{action}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </div>
    </div>
  );
};
