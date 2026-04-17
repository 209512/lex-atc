import React, { useEffect, useRef, useState, useMemo } from 'react';
import clsx from 'clsx';
import { LogItem } from '@/components/common/LogItem';
import { formatId } from '@/utils/agentIdentity';

const LOG_LINE_HEIGHT = 24;

interface LogListProps {
  logs: any[];
  isDark: boolean;
  isCollapsed: boolean;
  panelHeight: number;
  autoScroll: boolean;
  onAutoScrollChange: (autoScroll: boolean) => void;
  agentNameMap: Record<string, string>;
}

export const LogList: React.FC<LogListProps> = ({
  logs,
  isDark,
  isCollapsed,
  panelHeight,
  autoScroll,
  onAutoScrollChange,
  agentNameMap,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleLogs = useMemo(() => {
    const start = Math.floor(scrollTop / LOG_LINE_HEIGHT);
    const viewportLineCount = Math.ceil((panelHeight - 120) / LOG_LINE_HEIGHT);
    const end = Math.max(start + viewportLineCount + 4, 15);
    return { start: Math.max(0, start), end };
  }, [scrollTop, panelHeight]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop: currentTop, scrollHeight, clientHeight } = e.currentTarget;
    setScrollTop(currentTop);
    
    if (programmaticScrollRef.current) return;
    
    const isBottom = scrollHeight - clientHeight - currentTop < 50;
    if (isBottom !== autoScroll) {
      onAutoScrollChange(isBottom);
    }
  };

  useEffect(() => {
    if (!isCollapsed && scrollRef.current && autoScroll) {
      programmaticScrollRef.current = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          setTimeout(() => { programmaticScrollRef.current = false; }, 50);
        }
      });
    }
  }, [logs, autoScroll, isCollapsed]);

  return (
    <div 
        ref={scrollRef} 
        onScroll={handleScroll} 
        className={clsx("flex-1 overflow-y-auto custom-scrollbar relative", isDark ? "bg-black/10" : "bg-white/20")}
    >
      {!autoScroll && (
        <div className="sticky top-2 z-10 flex justify-center w-full pointer-events-none">
            <button 
                onClick={() => onAutoScrollChange(true)} 
                className="pointer-events-auto bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-3 py-1 rounded-full shadow-lg border border-white/10 opacity-90 transition-opacity"
            >
                RESUME SCROLL ↓
            </button>
        </div>
      )}
      <div style={{ height: Math.max(logs.length * LOG_LINE_HEIGHT, 1), position: 'relative' }}>
        {logs.slice(visibleLogs.start, visibleLogs.start + visibleLogs.end).map((log, idx) => {
          const actualIdx = visibleLogs.start + idx;
          const agentName = log.agentId && log.agentId !== 'SYSTEM' ? String(log.agentName || agentNameMap[log.agentId] || '') : null;
          
          let displayMsgRaw = log.message;
          if (agentName && !String(log.message || '').startsWith(`[${agentName}]`)) {
              displayMsgRaw = `[${agentName}] ${log.message}`;
          }
          const displayMsg = displayMsgRaw ? String(displayMsgRaw).replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/gi, match => formatId(match)) : '';
          
          return (
            <div key={`${log.id || log.timestamp || idx}-${actualIdx}`} className="absolute w-full px-2" style={{ top: actualIdx * LOG_LINE_HEIGHT, height: LOG_LINE_HEIGHT }}>
              <LogItem log={{...log, message: displayMsg}} isDark={isDark} />
            </div>
          );
        })}
      </div>
    </div>
  );
};