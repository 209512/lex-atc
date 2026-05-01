import React from 'react';
import clsx from 'clsx';
import { domainFilterOptions } from './logFilters';

interface TerminalFiltersBarProps {
  filteredLogsCount: number;
  totalLogsCount: number;
  actionKeyFilter: string;
  updateTerminalPreferences: (prefs: any) => void;
  actionFilterGroups: {domain: string, actions: string[]}[];
  domainFilter: string;
  isDark: boolean;
}

export const TerminalFiltersBar: React.FC<TerminalFiltersBarProps> = ({
  filteredLogsCount,
  totalLogsCount,
  actionKeyFilter,
  updateTerminalPreferences,
  actionFilterGroups,
  domainFilter,
  isDark
}) => {
  return (
    <div className={clsx("border-b px-2 py-1.5", isDark ? "border-gray-800 bg-black/20" : "border-slate-200 bg-white/40")}>
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 flex-nowrap overflow-x-auto min-w-0">
                {domainFilterOptions.map((option) => {
                    const btn = (
                        <button
                            key={option.value}
                            aria-label={`Terminal domain filter ${option.value}`}
                            onClick={() => updateTerminalPreferences({ domainFilter: option.value })}
                            className={clsx(
                                "rounded px-2 py-1 text-[9px] font-mono font-bold transition-colors shrink-0",
                                domainFilter === option.value
                                    ? "bg-blue-600 text-white"
                                    : (isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
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
