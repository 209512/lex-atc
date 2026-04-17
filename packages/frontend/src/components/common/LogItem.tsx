// src/components/common/LogItem.tsx
import React from 'react';
import clsx from 'clsx';
import { LogEntry } from '@/contexts/atcTypes';
import { getLogStyle } from '@/utils/logStyles';

interface LogItemProps {
    log: LogEntry;
    isDark: boolean;
    showTimestamp?: boolean;
    compact?: boolean;
    onClick?: (agentId: string) => void;
}

export const LogItem = React.memo(({ log, isDark, showTimestamp = true, compact = false, onClick }: LogItemProps) => {
    const style = getLogStyle(log.type, isDark);
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <div 
            className={clsx(
                "flex items-center gap-2 border-b last:border-0 w-full select-text transition-colors", 
                compact ? "py-0 px-1 text-[9px]" : "py-1 px-2 text-[11px]",
                isDark ? "border-white/5 hover:bg-white/5" : "border-black/5 hover:bg-black/5",
                log.agentId && log.agentId !== 'SYSTEM' && "cursor-pointer"
            )}
            onClick={(e) => {
                if (log.agentId && log.agentId !== 'SYSTEM' && onClick) {
                    e.stopPropagation();
                    onClick(log.agentId);
                }
            }}
        >
            {showTimestamp && (
                <span className="opacity-30 font-mono shrink-0 select-none text-[0.85em]">{timeStr}</span>
            )}
            {log.stage && (
                <span className={clsx("font-mono font-bold shrink-0 select-none", 
                    log.stage === 'request' ? 'text-blue-400' :
                    log.stage === 'accepted' ? 'text-green-400' :
                    log.stage === 'failed' ? 'text-red-400' :
                    'text-gray-400'
                )}>
                    [{log.stage === 'request' ? 'REQ' : log.stage === 'accepted' ? 'ACK' : log.stage === 'failed' ? 'FAIL' : log.stage.substring(0, 3).toUpperCase()}]
                </span>
            )}
            <span className={clsx("font-mono font-black shrink-0 select-none", style.className)}>
                {style.tag}
            </span>
            <span className={clsx("truncate font-mono flex-1 tracking-tight", style.className, compact && "font-normal")}>
                {log.message}
            </span>
        </div>
    );
});