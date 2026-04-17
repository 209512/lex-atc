import React from 'react';
import clsx from 'clsx';
import { isEconomyLog } from './logFilters';

interface TerminalAnalyticsProps {
  logs: any[];
  isDark: boolean;
}

export const TerminalAnalytics: React.FC<TerminalAnalyticsProps> = ({ logs, isDark }) => {
  return (
    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
            <div className={clsx("rounded-lg border p-3", isDark ? "bg-black/30 border-white/10" : "bg-white/50 border-slate-200")}>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-yellow-500 mb-2">Economy Events</div>
                <div className="text-2xl font-mono">{(logs || []).filter(l => isEconomyLog(l.message, l.type)).length}</div>
            </div>
            <div className={clsx("rounded-lg border p-3", isDark ? "bg-black/30 border-white/10" : "bg-white/50 border-slate-200")}>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-500 mb-2">System Errors</div>
                <div className="text-2xl font-mono">{(logs || []).filter(l => l.type === 'error' || l.type === 'critical').length}</div>
            </div>
        </div>
        <div className={clsx("flex-1 rounded-lg border p-3", isDark ? "bg-black/30 border-white/10" : "bg-white/50 border-slate-200")}>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest mb-3 opacity-70">Logs by Domain</div>
            <div className="space-y-2">
                {Object.entries((logs || []).reduce((acc, log) => {
                     const domain = log.domain || 'system';
                     acc[domain] = (acc[domain] || 0) + 1;
                     return acc;
                 }, {} as Record<string, number>)).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([domain, count]) => (
                     <div key={domain} className="flex justify-between items-center text-xs">
                         <span className="text-gray-400 capitalize">{domain}</span>
                         <span className="font-bold opacity-70">{count as number}</span>
                     </div>
                 ))}
            </div>
        </div>
    </div>
  );
};
