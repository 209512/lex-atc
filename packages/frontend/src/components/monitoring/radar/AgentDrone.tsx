// src/components/monitoring/radar/AgentDrone.tsx
import { useShallow } from 'zustand/react/shallow';
import React, { useRef, useEffect, useMemo, useState } from 'react';
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
import { getOrbitPosition } from '@/utils/orbit';
import { Tooltip } from '@/components/common/Tooltip';
import { RISK_AXIS_META, RISK_AXIS_INDEX, normalizeRiskVector8, splitRiskVectorRows, getAxesForDisplayMode } from '@/utils/riskVector';
import type { RiskAxisKey } from '@/utils/riskVector';

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
    const bodyRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
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
    const stopStartedAt = useRef<number | null>(null);
    const totalStoppedMs = useRef(0);
    const [isHovered, setIsHovered] = useState(false);
    const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const noiseSeed = useMemo(() => {
        let h = 2166136261;
        for (let i = 0; i < id.length; i++) {
            h ^= id.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967295;
    }, [id]);
    const threatColor = useMemo(() => new THREE.Color(), []);

    const agentData = useMemo(() => agents.find(a => a.id === id), [agents, id]);
    const displayId = agentData?.displayId || id;

    const coreColor = useMemo(() => {
        if (isOverride) return LOG_LEVELS.critical.color;
        if (isPaused || isGlobalStopped) return isDark ? '#64748b' : '#94a3b8'; 
        
        if (isForced) return LOG_LEVELS.system.color;
        if (isLocked) return LOG_LEVELS.success.color;
        if (isPriority) return LOG_LEVELS.warn.color;
        
        return color;
    }, [isOverride, isPaused, isGlobalStopped, isForced, isLocked, isPriority, color, isDark]);

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

    useEffect(() => {
        if (isGlobalStopped) {
            if (!stopStartedAt.current) stopStartedAt.current = Date.now();
            return;
        }
        if (stopStartedAt.current) {
            totalStoppedMs.current += Date.now() - stopStartedAt.current;
            stopStartedAt.current = null;
        }
    }, [isGlobalStopped]);

    const orbitSeed = typeof (agentData as any)?.orbit?.seed === 'number' ? (agentData as any).orbit.seed : null;
    const orbitSpawnTime = typeof (agentData as any)?.orbit?.spawnTime === 'number' ? (agentData as any).orbit.spawnTime : null;
    const orbitTotalPausedMs = typeof (agentData as any)?.orbit?.totalPausedMs === 'number' ? (agentData as any).orbit.totalPausedMs : 0;

    useEffect(() => {
        if (orbitSeed === null || orbitSpawnTime === null) return;
        const stoppedMs = totalStoppedMs.current + (stopStartedAt.current ? (Date.now() - stopStartedAt.current) : 0);
        const activeTime = Math.max(0, Date.now() - orbitSpawnTime - orbitTotalPausedMs - stoppedMs);
        const p = getOrbitPosition(orbitSeed, activeTime);
        currentPos.current.set(p[0], p[1], p[2]);
        targetVec.current.set(p[0], p[1], p[2]);
        if (groupRef.current && !(isPaused || isGlobalStopped)) {
            groupRef.current.position.copy(currentPos.current);
        }
    }, [orbitSeed, orbitSpawnTime, orbitTotalPausedMs, isPaused, isGlobalStopped]);

    useFrame((frameState) => {
        if (!groupRef.current) return;

        const effectivelyPaused = isPaused || isGlobalStopped;
        const rv = (agentData as any)?.riskVector;
        const riskVector: number[] = Array.isArray(rv) && rv.length === 8 ? rv : [0, 0, 0, 0, 0, 0, 0, 0];
        const threat = typeof riskVector[0] === 'number' && Number.isFinite(riskVector[0]) ? riskVector[0] : 0;
        const entropy = typeof riskVector[2] === 'number' && Number.isFinite(riskVector[2]) ? riskVector[2] : 0;
        const impact = typeof riskVector[5] === 'number' && Number.isFinite(riskVector[5]) ? riskVector[5] : 0;
        const timing = typeof riskVector[7] === 'number' && Number.isFinite(riskVector[7]) ? riskVector[7] : 0;

        if (effectivelyPaused) {
            groupRef.current.position.copy(currentPos.current);
        } else {
            if (orbitSeed !== null && orbitSpawnTime !== null) {
                const stoppedMs = totalStoppedMs.current + (stopStartedAt.current ? (Date.now() - stopStartedAt.current) : 0);
                const activeTime = Math.max(0, Date.now() - orbitSpawnTime - orbitTotalPausedMs - stoppedMs);
                const p = getOrbitPosition(orbitSeed, activeTime);
                targetVec.current.set(p[0], p[1], p[2]);
            } else {
                targetVec.current.set(position[0], position[1], position[2]);
            }

            const lerpFactor = isResuming.current ? 0.02 : 0.06;

            groupRef.current.position.lerp(targetVec.current, lerpFactor);
            const baseY = groupRef.current.position.y;
            currentPos.current.copy(groupRef.current.position);

            const baseRot = reducedEffects ? 0.006 : (0.012 + timing * 0.09);
            const rotSpeed = isForced ? (baseRot + 0.08) : baseRot;
            groupRef.current.rotation.y += rotSpeed;
            if (!reducedEffects) {
                groupRef.current.position.y = baseY + Math.sin(frameState.clock.elapsedTime * 0.8) * 0.0015;
            }
        }

        const impactScale = 1 + Math.max(0, Math.min(1, impact)) * 1.5;
        const pulseFactor = reducedEffects ? 0 : (isOverride ? 12 : (isForced ? 8 : (isSelected || isPriority ? 3 : 0)));
        if (pulseFactor > 0) {
            const s = 1 + Math.sin(frameState.clock.elapsedTime * pulseFactor) * 0.12;
            const v = s * impactScale;
            groupRef.current.scale.set(v, v, v);
        } else {
            groupRef.current.scale.set(impactScale, impactScale, impactScale);
        }

        if (bodyRef.current) {
            if (effectivelyPaused || reducedEffects) {
                bodyRef.current.position.set(0, 0, 0);
            } else {
                const amp = Math.max(0, Math.min(1, entropy)) * 0.06;
                const t = frameState.clock.elapsedTime;
                const ox = Math.sin(t * 11.0 + noiseSeed * 40.0) * amp;
                const oy = Math.sin(t * 13.0 + noiseSeed * 75.0) * amp * 0.65;
                const oz = Math.sin(t * 9.0 + noiseSeed * 22.0) * amp;
                bodyRef.current.position.set(ox, oy, oz);
            }
        }

        if (materialRef.current) {
            const special = isOverride || isForced || isLocked || isPriority || isSelected || effectivelyPaused;
            const safeThreat = Math.max(0, Math.min(1, threat));
            const emissiveIntensity = effectivelyPaused ? 0.3 : (0.6 + safeThreat * 2.1);
            materialRef.current.emissiveIntensity = special ? ((isPaused || isGlobalStopped) ? 0.3 : 1.5) : emissiveIntensity;
            if (!special) {
                const hue = 0.33 * (1 - safeThreat);
                threatColor.setHSL(hue, 1, 0.5);
                materialRef.current.color.copy(threatColor);
                materialRef.current.emissive.copy(threatColor);
            } else {
                materialRef.current.color.set(coreColor);
                materialRef.current.emissive.set(coreColor);
            }
        }
    });

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
                <mesh
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        if (hoverHideTimer.current) {
                            clearTimeout(hoverHideTimer.current);
                            hoverHideTimer.current = null;
                        }
                        setIsHovered(true);
                    }}
                    onPointerOut={(e) => {
                        e.stopPropagation();
                        if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
                        hoverHideTimer.current = setTimeout(() => setIsHovered(false), 150);
                    }}
                    onClick={(e) => { 
                    e.stopPropagation(); 
                    onClick(id); 
                }}>
                    <sphereGeometry args={[1.5, 8, 8]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

                {/* 기체 가시화 */}
                <mesh ref={bodyRef}>
                    <octahedronGeometry args={[0.5, 0]} />
                    <meshStandardMaterial 
                        ref={materialRef}
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

                {isHovered && agentData && (
                    <Html position={[0, 1.6, 0]} center distanceFactor={15} zIndexRange={[0, 10]} style={{ pointerEvents: 'auto' }}>
                        <div className={clsx(
                            "px-2 py-1 rounded border text-[9px] font-mono backdrop-blur-sm",
                            isDark ? "bg-black/70 border-white/20 text-white" : "bg-white/90 border-slate-300 text-slate-700"
                        )}
                        onMouseEnter={() => {
                            if (hoverHideTimer.current) {
                                clearTimeout(hoverHideTimer.current);
                                hoverHideTimer.current = null;
                            }
                        }}
                        onMouseLeave={() => {
                            if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
                            hoverHideTimer.current = setTimeout(() => setIsHovered(false), 150);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        >
                            {(() => {
                                const rv = normalizeRiskVector8((agentData as any).riskVector);
                                const mode = useUIStore.getState().uiPreferences?.riskVector?.displayMode ?? 'full';
                                const axes = getAxesForDisplayMode(mode);
                                const [row1, row2] = splitRiskVectorRows(axes);
                                const Row = ({ keys }: { keys: readonly RiskAxisKey[] }) => (
                                    <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                                        {keys.map((k) => {
                                            const v = rv[RISK_AXIS_INDEX[k] as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7];
                                            return (
                                                <div key={k} className="flex items-center gap-1">
                                                    <Tooltip content={`${RISK_AXIS_META[k as keyof typeof RISK_AXIS_META].name} — ${RISK_AXIS_META[k as keyof typeof RISK_AXIS_META].description}`} position="top">
                                                        <span className="opacity-70">{k}</span>
                                                    </Tooltip>
                                                    <span className="opacity-90">{v.toFixed(2)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                                return (
                                    <div className="space-y-0.5">
                                        <Row keys={row1 as RiskAxisKey[]} />
                                        {axes.length > 4 && <Row keys={row2 as RiskAxisKey[]} />}
                                    </div>
                                );
                            })()}
                        </div>
                    </Html>
                )}

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
