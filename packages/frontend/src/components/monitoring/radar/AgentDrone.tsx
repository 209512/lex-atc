// src/components/monitoring/radar/AgentDrone.tsx
import { useShallow } from 'zustand/react/shallow';
import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line as DreiLine } from '@react-three/drei';
import * as THREE from 'three';
import { Star, Pause } from 'lucide-react';
import clsx from 'clsx';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { useAudio } from '@/hooks/system/useAudio';
import { AgentDetailPopup } from '@/components/monitoring/radar/AgentDetailPopup';
import { LOG_LEVELS } from '@/utils/logStyles';

interface AgentDroneProps {
    id: string;
    position: [number, number, number];
    isLocked: boolean;
    isOverride: boolean;
    color: string;
    onClick: (id: string) => void;
    isPaused: boolean; 
    isPriority: boolean;
    reducedEffects?: boolean;
}

export const AgentDrone = ({ 
    id, position = [0, 0, 0], isLocked, isOverride, color, 
    onClick, isPaused, isPriority, reducedEffects = false
}: AgentDroneProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const { state, isAdminMuted, agents, togglePause, togglePriority, transferLock, terminateAgent  } = useATCStore(useShallow(s => ({ state: s.state, isAdminMuted: s.isAdminMuted, agents: s.agents, togglePause: s.actions.togglePause, togglePriority: s.actions.togglePriority, transferLock: s.actions.transferLock, terminateAgent: s.actions.terminateAgent })));
    const { selectedAgentId, isDark, setSelectedAgentId  } = useUIStore(useShallow(s => ({ selectedAgentId: s.selectedAgentId, isDark: s.isDark, setSelectedAgentId: s.setSelectedAgentId })));
    const { playSuccess } = useAudio(isAdminMuted);

    const isGlobalStopped = !!state?.globalStop;
    const isSelected = selectedAgentId === id;
    const isForced = state?.forcedCandidate === id;

    const currentPos = useRef(new THREE.Vector3(...position));
    const targetVec = useRef(new THREE.Vector3(...position));
    const prevLocked = useRef(isLocked);
    
    const isResuming = useRef(false);

    const agentData = useMemo(() => agents.find(a => a.id === id), [agents, id]);
    const displayId = agentData?.displayId || id;

    useEffect(() => {
        if (isLocked && !prevLocked.current) {
            playSuccess();
        }
        prevLocked.current = isLocked;
    }, [isLocked, playSuccess]);

    useEffect(() => {
        const effectivelyPaused = isPaused || isGlobalStopped;
        if (!effectivelyPaused) {
            isResuming.current = true;
            if (groupRef.current) {
                targetVec.current.copy(groupRef.current.position);
            }
            const timer = setTimeout(() => { isResuming.current = false; }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isPaused, isGlobalStopped]);

    useFrame((frameState) => {
        if (!groupRef.current) return;

        const effectivelyPaused = isPaused || isGlobalStopped;

        if (effectivelyPaused) {
            groupRef.current.position.copy(currentPos.current);
        } else {
            targetVec.current.set(position[0], position[1], position[2]);

            const lerpFactor = isResuming.current ? 0.02 : 0.06;

            groupRef.current.position.lerp(targetVec.current, lerpFactor);
            const baseY = groupRef.current.position.y;
            currentPos.current.copy(groupRef.current.position);

            const rotSpeed = reducedEffects ? 0.006 : (isForced ? 0.08 : 0.02);
            groupRef.current.rotation.y += rotSpeed;
            if (!reducedEffects) {
                groupRef.current.position.y = baseY + Math.sin(frameState.clock.elapsedTime * 0.8) * 0.0015;
            }
        }

        const pulseFactor = reducedEffects ? 0 : (isOverride ? 12 : (isForced ? 8 : (isSelected || isPriority ? 3 : 0)));
        if (pulseFactor > 0) {
            const s = 1 + Math.sin(frameState.clock.elapsedTime * pulseFactor) * 0.12;
            groupRef.current.scale.set(s, s, s);
        } else {
            groupRef.current.scale.set(1, 1, 1);
        }
    });

    const coreColor = useMemo(() => {
        if (isOverride) return LOG_LEVELS.critical.color;
        if (isPaused || isGlobalStopped) return isDark ? '#64748b' : '#94a3b8'; 
        
        if (isForced) return LOG_LEVELS.system.color;
        if (isLocked) return LOG_LEVELS.success.color;
        if (isPriority) return LOG_LEVELS.warn.color;
        
        return color;
    }, [isOverride, isPaused, isGlobalStopped, isForced, isLocked, isPriority, color, isDark]);

    const recentLogs = useMemo(() => {
        const isSlashed = (agentData as any)?.slash === true;
        const baseLogs = (state?.logs || [])
            .filter(l => l.agentId === id && Date.now() - Number(l.timestamp) < 3000)
            .slice(-3); // Show max 3 recent logs
            
        if (isSlashed) {
            baseLogs.push({
                id: `slash-${Date.now()}`,
                agentId: id,
                message: '💥 SLASHED',
                timestamp: Date.now(),
                type: 'critical' as any
            });
        }
        return baseLogs;
    }, [state?.logs, id, agentData]);

    return (
        <>
            {isGlobalStopped && (
                <group>
                    {[...Array(12)].map((_, i) => (
                        <mesh key={`dot-${id}-${i}`} position={currentPos.current.clone().multiplyScalar((i + 1) / 13)}>
                            <sphereGeometry args={[0.04, 6, 6]} />
                            <meshBasicMaterial color={coreColor} transparent opacity={0.6} />
                        </mesh>
                    ))}
                </group>
            )}

            <group ref={groupRef}>
                {/* [클릭 영역] 투명 히트박스 */}
                <mesh onClick={(e) => { 
                    e.stopPropagation(); 
                    onClick(id); 
                }}>
                    <sphereGeometry args={[1.5, 8, 8]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

                {/* 기체 가시화 */}
                <mesh>
                    <octahedronGeometry args={[0.5, 0]} />
                    <meshStandardMaterial 
                        color={coreColor} 
                        emissive={coreColor} 
                        emissiveIntensity={(isPaused || isGlobalStopped) ? 0.3 : 1.5} 
                        wireframe 
                    />
                </mesh>

                <DroneLabel 
                    displayId={displayId} isDark={isDark} isLocked={isLocked}
                    isSelected={isSelected} isPaused={isPaused || isGlobalStopped}
                    isPriority={isPriority} isOverride={isOverride}
                />

                {/* Floating Effect for Money / Logs */}
                {recentLogs.map((log, idx) => (
                    <Html key={log.id} position={[0, 1.5 + idx * 0.4, 0]} center distanceFactor={15} zIndexRange={[0, 10]} style={{ pointerEvents: 'none' }}>
                        <div className={clsx(
                            "px-1.5 py-0.5 rounded text-[8px] font-mono border whitespace-nowrap animate-bounce shadow-lg",
                            log.type === 'critical' || log.message.includes('Slash') ? "bg-red-500 text-white border-red-400 scale-125" :
                            log.message.includes('SOL') ? "bg-emerald-500/90 text-white border-emerald-400" :
                            "bg-black/70 text-white border-gray-500"
                        )}>
                            {log.message.includes('SOL') ? log.message.split(' ').slice(-2).join(' ') : (log.message.includes('Slash') ? '💥 SLASHED' : log.message.slice(0, 15))}
                        </div>
                    </Html>
                ))}

                {/* 레이더 팝업창 */}
                {isSelected && agentData && (
                    <AgentDetailPopup 
                        agent={agentData} 
                        position={[0, 0, 0]} 
                        onClose={() => setSelectedAgentId(null)} 
                        isDark={isDark}
                        onTerminate={terminateAgent} 
                        onTogglePriority={togglePriority}
                        onTransferLock={transferLock} 
                        onTogglePause={togglePause}
                    />
                )}
                
                {(isLocked || isForced) && !isGlobalStopped && (
                    <DreiLine 
                        points={[[0, 0, 0], [-currentPos.current.x, -currentPos.current.y, -currentPos.current.z]]} 
                        color={coreColor} 
                        lineWidth={1.2}
                        transparent
                        opacity={0.4}
                    />
                )}
            </group>
        </>
    );
};

const DroneLabel = ({ displayId, isDark, isLocked, isSelected, isPaused, isPriority, isOverride }: any) => (
    <Html position={[0, 0.9, 0]} center distanceFactor={12} zIndexRange={[0, 10]} style={{ pointerEvents: 'none' }}>
        <div className={clsx(
            "px-1.5 py-0.5 rounded text-[9px] font-mono border backdrop-blur-sm flex items-center gap-1 whitespace-nowrap select-none transition-all",
            isDark ? "bg-black/60 border-white/20 text-white" : "bg-white/90 border-slate-300 text-slate-700 shadow-sm",
            isLocked && !isPaused && !isOverride && (isDark ? "bg-emerald-500/20 border-emerald-500 text-emerald-500" : "bg-emerald-50 border-emerald-500 text-emerald-600"),
            isOverride && "bg-red-500/20 border-red-500 text-red-500 animate-pulse",
            isSelected && "ring-1 ring-blue-500/50 scale-110 z-30",
            isPaused && (isDark ? "opacity-60 border-slate-600 bg-slate-900/50" : "opacity-50 grayscale")
        )}>
            {isPriority && !isOverride && <Star size={8} className={clsx("fill-current", isDark ? "text-yellow-500" : "text-amber-500")} />}
            {isPaused && <Pause size={7} className="fill-current text-slate-400" />}
            <span className={clsx(isPaused && "line-through decoration-1 opacity-70 text-slate-400")}>
                {isOverride ? `OVERRIDING...` : (isPaused ? `[P] ${displayId}` : displayId)}
            </span>
        </div>
    </Html>
);
