// src/components/agent/AgentLogs.tsx
import React, { useRef, useEffect, useState, useMemo } from 'react';
import clsx from 'clsx';
import { LogEntry } from '@/contexts/atcTypes';
import { LogItem } from '@/components/common/LogItem';

interface AgentLogsProps {
    logs: LogEntry[];
    isDark: boolean;
    isSelected: boolean;
}

const ITEM_HEIGHT = 22;

export const AgentLogs = ({ logs, isDark, isSelected }: AgentLogsProps) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [autoScroll, setAutoScroll] = useState(true);

    const visibleRange = useMemo(() => {
        const start = Math.floor(scrollTop / ITEM_HEIGHT);
        const end = Math.min(logs.length, start + 12); 
        return { start, end };
    }, [scrollTop, logs.length]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop: currentTop, scrollHeight, clientHeight } = e.currentTarget;
        setScrollTop(currentTop);
        const isAtBottom = scrollHeight - clientHeight - currentTop < 20;
        setAutoScroll(isAtBottom);
    };

    useEffect(() => {
        if (isSelected && autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs.length, isSelected, autoScroll]);

    return (
        <div className="relative group/agent-logs">
            <div 
                ref={logContainerRef} 
                onScroll={handleScroll} 
                className={clsx(
                    "p-1 rounded font-mono text-[9px] h-32 overflow-y-auto border custom-scrollbar mt-3 relative transition-colors", 
                    isDark ? "bg-black/40 border-white/5" : "bg-slate-50 border-slate-200 shadow-inner"
                )}
            >
                {logs.length > 0 ? (
                    <div style={{ height: logs.length * ITEM_HEIGHT, position: 'relative' }}>
                        {logs.slice(visibleRange.start, visibleRange.end).map((log, idx) => {
                            const actualIdx = visibleRange.start + idx;
                            return (
                                <div 
                                    key={`${log.id}-${actualIdx}`}
                                    className="absolute w-full"
                                    style={{ 
                                        top: actualIdx * ITEM_HEIGHT,
                                        height: ITEM_HEIGHT 
                                    }}
                                >
                                    <LogItem log={log} isDark={isDark} compact={true} showTimestamp={true} />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 py-10 italic text-[8px] uppercase gap-2">
                        <span>[Idle_Stream]</span>
                    </div>
                )}
            </div>

            {!autoScroll && logs.length > 0 && (
                <button 
                    onClick={() => setAutoScroll(true)}
                    className="absolute bottom-2 right-4 bg-blue-600/80 hover:bg-blue-600 text-white text-[8px] px-2 py-0.5 rounded-full shadow-lg animate-bounce z-10 border border-white/10"
                >
                    NEW_LOG ↓
                </button>
            )}
        </div>
    );
};