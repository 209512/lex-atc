// src/components/monitoring/radar/AgentDetailPopup.tsx
import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { X, Pause, Activity, Cpu, Database } from 'lucide-react'; 
import clsx from 'clsx';
import { Agent } from '@/contexts/atcTypes';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { useAgentLogic } from '@/hooks/agent/useAgentLogic';
import { useTacticalActions } from '@/hooks/agent/useTacticalActions';
import { AgentActionButtons } from '@/components/common/AgentActionButtons';
import { LOG_LEVELS } from '@/utils/logStyles';
import { Tooltip } from '@/components/common/Tooltip';
import { RISK_AXIS_META, RISK_AXIS_INDEX, normalizeRiskVector8, getAxesForDisplayMode } from '@/utils/riskVector';

interface AgentDetailPopupProps {
    agent: Agent | undefined;
    position: [number, number, number] | undefined;
    onClose: () => void;
    isDark: boolean;
    onTerminate: (id: string) => void;
    onTogglePriority: (id: string, enable: boolean) => void;
    onTransferLock: (id: string) => void;
    onTogglePause: (id: string, isPaused: boolean) => void;
    isCompact?: boolean;
}

export const AgentDetailPopup = ({ 
    agent, position, onClose, isDark, 
    isCompact = false
}: AgentDetailPopupProps) => {
    const { state  } = useATCStore(useShallow(s => ({ state: s.state })));
    const { uiPreferences } = useUIStore(useShallow(s => ({ uiPreferences: s.uiPreferences })));
    const { onTogglePause, onTransferLock, togglePriority, terminateAgent } = useTacticalActions();

    const safeAgent = (agent ?? {
        id: '',
        uuid: '',
        model: '',
        status: 'idle',
        position: [0, 0, 0],
    }) as Agent;

    const { isPaused, isForced, statusLabel, isLocked } = useAgentLogic(safeAgent, state);

    const popupRef = useRef<HTMLDivElement>(null);
    const riskVector = normalizeRiskVector8((safeAgent as any).riskVector);
    const vectorDisplayMode = uiPreferences?.riskVector?.displayMode ?? 'full';
    const axes = getAxesForDisplayMode(vectorDisplayMode);
    const agentKey = agent?.id ?? '';
    const baseY = isCompact ? -120 : -150;
    const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: baseY });
    const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: baseY });
    const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        offsetRef.current = { x: 0, y: baseY };
        setOffset(offsetRef.current);
        dragRef.current.active = false;
    }, [agentKey, baseY]);

    useLayoutEffect(() => {
        if (!agentKey) return;
        const el = popupRef.current;
        if (!el) return;
        const pad = 10;

        const apply = (next: { x: number; y: number }) => {
            el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
        };

        const clamp = () => {
            let dx = offsetRef.current.x;
            let dy = offsetRef.current.y;
            apply({ x: dx, y: dy });

            const rect = el.getBoundingClientRect();
            if (rect.top < pad) dy += pad - rect.top;
            if (rect.bottom > window.innerHeight - pad) dy -= rect.bottom - (window.innerHeight - pad);
            if (rect.left < pad) dx += pad - rect.left;
            if (rect.right > window.innerWidth - pad) dx -= rect.right - (window.innerWidth - pad);
            if (dx !== offsetRef.current.x || dy !== offsetRef.current.y) {
                offsetRef.current = { x: dx, y: dy };
                apply(offsetRef.current);
                setOffset(offsetRef.current);
            }
        };

        const raf = requestAnimationFrame(clamp);
        window.addEventListener('resize', clamp);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', clamp);
        };
    }, [agentKey, isCompact]);

    if (!agent || !position) return null;

    const startDrag = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, originX: offsetRef.current.x, originY: offsetRef.current.y };
        (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);

        const onMove = (ev: PointerEvent) => {
            if (!dragRef.current.active) return;
            const dx = ev.clientX - dragRef.current.startX;
            const dy = ev.clientY - dragRef.current.startY;
            offsetRef.current = { x: dragRef.current.originX + dx, y: dragRef.current.originY + dy };
            if (rafRef.current == null) {
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    const el = popupRef.current;
                    if (el) el.style.transform = `translate3d(${offsetRef.current.x}px, ${offsetRef.current.y}px, 0)`;
                });
            }
        };

        const onUp = () => {
            dragRef.current.active = false;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            setOffset(offsetRef.current);
        };

        const onCancel = () => {
            dragRef.current.active = false;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            setOffset(offsetRef.current);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    };

    return (
        <Html position={position} center zIndexRange={[100, 0]} pointerEvents="auto" occlude={false}>
             <div 
                ref={popupRef}
                className={clsx(
                    "p-4 rounded-lg border shadow-2xl backdrop-blur-xl transition-colors duration-300 select-none",
                    "pointer-events-auto",
                    isCompact ? "w-48 scale-90" : "w-64",
                    isForced ? "ring-2 ring-purple-500 bg-purple-900/20" : 
                    (isDark ? "bg-[#0d1117]/95 border-gray-700 text-gray-300" : "bg-white/95 border-slate-300 text-slate-700")
                )}
                style={{ cursor: 'default', transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }} 
                onPointerDown={(e) => { e.stopPropagation(); }}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); }}
                onWheel={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-3 border-b pb-2 border-gray-500/20 cursor-move" onPointerDown={startDrag}>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Activity size={14} className="shrink-0" style={{ color: isLocked ? LOG_LEVELS.success.color : LOG_LEVELS.info.color }} />
                        <span className="font-black text-xs font-mono tracking-tighter truncate">
                            {agent.displayId || agent.id}
                        </span>
                        {isPaused && <Pause size={10} className="animate-pulse shrink-0" style={{ color: LOG_LEVELS.system.color }} />}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="hover:text-red-500 transition-colors ml-2 shrink-0 p-1 cursor-pointer">
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-1.5 text-[10px] font-mono mb-4">
                    <div className="flex justify-between items-center">
                        <span className="opacity-50 flex items-center gap-1"><Cpu size={10}/> STATUS</span> 
                        <span 
                            className="font-bold px-1 rounded" 
                            style={{ 
                                color: isPaused ? LOG_LEVELS.system.color : LOG_LEVELS.success.color,
                                backgroundColor: isPaused ? `${LOG_LEVELS.system.color}1A` : `${LOG_LEVELS.success.color}1A`
                            }}
                        >
                            {statusLabel}
                        </span>
                    </div>
                    {!isCompact && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="opacity-50 flex items-center gap-1"><Database size={10}/> PROVIDER</span> 
                                <span className="text-blue-400 font-bold uppercase">{(agent as any).provider || 'MOCK_API'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="opacity-50">MODEL_ID</span> 
                                <span className="text-gray-400 truncate max-w-[110px]">{agent.model || 'DEFAULT'}</span>
                            </div>
                        </>
                    )}
                </div>

                {!isCompact && (
                    <div className="mb-4">
                        <div className="text-[9px] font-mono opacity-60 mb-2">RISK VECTOR (8D)</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1" data-testid="risk-vector-bars">
                            {axes.map((k) => {
                                const i = RISK_AXIS_INDEX[k];
                                const v = riskVector[i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7];
                                return (
                                    <div key={k} className="flex items-center gap-2" data-testid={`risk-axis-${k}`}>
                                        <Tooltip content={`${RISK_AXIS_META[k].name} — ${RISK_AXIS_META[k].description}`} position="top">
                                            <div className="w-6 text-[9px] font-mono opacity-60">{k}</div>
                                        </Tooltip>
                                        <div className={clsx("flex-1 h-2 rounded overflow-hidden", isDark ? "bg-white/10" : "bg-slate-200")}>
                                            <div
                                                className={clsx("h-full rounded", isDark ? "bg-emerald-400" : "bg-emerald-600")}
                                                style={{ width: `${Math.round(v * 100)}%` }}
                                            />
                                        </div>
                                        <div className="w-8 text-right text-[9px] font-mono opacity-80">{v.toFixed(2)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                
                <div className="pt-2 border-t border-gray-500/20">
                    <AgentActionButtons 
                        agent={agent} 
                        state={state}
                        onTogglePriority={togglePriority}
                        onTogglePause={onTogglePause}
                        onTerminate={terminateAgent}
                        onTransferLock={onTransferLock}
                        layout="compact"
                        showLabels={false}
                        tooltipPosition="top"
                    />
                </div>
            </div>
        </Html>
    );
};
