import React, { useEffect, useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useATCStore } from '@/store/atc';
import { useModalStore } from '@/store/ui/modalStore';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';

interface AlertItem {
  id: string;
  agentId: string;
  message: string;
  timestamp: number;
}

export const SmartAlerts = () => {
  const { logs } = useATCStore(useShallow(s => ({ logs: s.state.logs || [] })));
  const isDark = useUIStore(s => s.isDark);
  const { openOperationsModal } = useModalStore();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const processedLogs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (logs.length === 0) return;
    
    // Grab the most recent logs
    const recentLogs = logs.slice(-5);
    
    recentLogs.forEach(latest => {
      if (processedLogs.current.has(latest.id)) return;
      processedLogs.current.add(latest.id);

      // Look for problematic logs that might need human intervention
      const triggerKeywords = ['BLOCKED_BY', 'COLLISION', 'LATENCY', 'FAILED'];
      const msg = (latest.message || '').toUpperCase();
      const isTrigger = triggerKeywords.some(kw => msg.includes(kw));

      // Also look for specific action keys
      const isPolicyFail = latest.type === 'policy' && latest.meta?.stage === 'failed';
      const isError = latest.type === 'error';

      if ((isTrigger || isPolicyFail || isError) && latest.agentId && latest.agentId !== 'SYSTEM' && latest.agentId !== 'UNKNOWN') {
        const agentId = latest.agentId;
        setAlerts(prev => {
          // Prevent spamming the same agent
          if (prev.some(a => a.agentId === agentId)) return prev;
          return [...prev, {
            id: latest.id,
            agentId,
            message: `Issue detected: ${msg.substring(0, 30)}...`,
            timestamp: Date.now()
          }].slice(-3); // Keep max 3 alerts
        });
      }
    });

    // Keep the set size manageable
    if (processedLogs.current.size > 100) {
      const arr = Array.from(processedLogs.current).slice(-50);
      processedLogs.current = new Set(arr);
    }
  }, [logs]);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setAlerts(prev => prev.filter(a => now - a.timestamp < 15000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleEscalate = (agentId: string, id: string) => {
    openOperationsModal(agentId, 'dispute');
    dismiss(id);
  };

  return (
    <div className="absolute top-[280px] right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {alerts.map(alert => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className={clsx(
              "pointer-events-auto w-72 rounded-lg border shadow-2xl overflow-hidden backdrop-blur-md",
              isDark ? "bg-[#0d1117]/90 border-red-900/50" : "bg-white/90 border-red-200"
            )}
          >
            <div className={clsx("px-3 py-2 flex items-center justify-between border-b", isDark ? "border-red-900/30 bg-red-900/20" : "border-red-100 bg-red-50")}>
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle size={14} />
                <span className="text-[10px] font-bold font-mono uppercase tracking-widest">Smart Alert</span>
              </div>
              <button onClick={() => dismiss(alert.id)} className="text-gray-400 hover:text-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="p-3">
              <div className={clsx("text-xs font-mono mb-1 font-bold", isDark ? "text-gray-200" : "text-slate-800")}>
                Agent {alert.agentId}
              </div>
              <div className={clsx("text-[10px] font-mono opacity-80 mb-3", isDark ? "text-gray-400" : "text-slate-600")}>
                {alert.message}
              </div>
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={() => dismiss(alert.id)}
                  className={clsx("px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors", isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-slate-100 text-slate-500")}
                >
                  Ignore
                </button>
                <button 
                  onClick={() => handleEscalate(alert.agentId, alert.id)}
                  className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                >
                  Draft Dispute <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
