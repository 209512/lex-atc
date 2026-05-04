import { useShallow } from 'zustand/react/shallow';
import React, { useRef, useEffect, useMemo } from 'react';
import { Line as DreiLine } from '@react-three/drei';
import * as THREE from 'three';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { useAudio } from '@/hooks/system/useAudio';
import { AgentDetailPopup } from '@/components/monitoring/radar/drone/AgentDetailPopup';
import { LOG_LEVELS } from '@/utils/logStyles';
import { getOrbitPosition } from '@/utils/orbit';
import { AgentDroneLabel } from '@/components/monitoring/radar/drone/AgentDroneLabel';
import { AgentDroneRiskTooltip } from '@/components/monitoring/radar/drone/AgentDroneRiskTooltip';
import { AgentDroneRecentLogPills } from '@/components/monitoring/radar/drone/AgentDroneRecentLogPills';
import { AgentDroneStopDots } from '@/components/monitoring/radar/drone/AgentDroneStopDots';
import { useAgentDroneFrame } from '@/components/monitoring/radar/drone/useAgentDroneFrame';
import { useAgentDroneHover } from '@/components/monitoring/radar/drone/useAgentDroneHover';
import { useAgentDroneRecentLogs } from '@/components/monitoring/radar/drone/useAgentDroneRecentLogs';

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
    isCompact?: boolean;
}

export const AgentDrone = ({ 
    id, position = [0, 0, 0], isLocked, isOverride, color, 
    onClick, isPaused, isPriority, reducedEffects = false, isCompact = false
}: AgentDroneProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const { state, isAdminMuted, agents, togglePause, togglePriority, transferLock, terminateAgent  } = useATCStore(useShallow(s => ({ state: s.state, isAdminMuted: s.isAdminMuted, agents: s.agents, togglePause: s.actions.togglePause, togglePriority: s.actions.togglePriority, transferLock: s.actions.transferLock, terminateAgent: s.actions.terminateAgent })));
    const { selectedAgentId, isDark, setSelectedAgentId  } = useUIStore(useShallow(s => ({ selectedAgentId: s.selectedAgentId, isDark: s.isDark, setSelectedAgentId: s.setSelectedAgentId })));
    const { playSuccess } = useAudio(isAdminMuted);

    const isGlobalStopped = !!state?.globalStop;
    const agentData = useMemo(() => agents.find(a => a.id === id || a.uuid === id), [agents, id]);
    const agentUuid = agentData?.uuid || id;
    const isSelected = selectedAgentId === id || selectedAgentId === agentUuid;
    const isForced = state?.forcedCandidate === agentUuid;

    const currentPos = useRef(new THREE.Vector3(...position));
    const targetVec = useRef(new THREE.Vector3(...position));
    const prevLocked = useRef(isLocked);
    
    const isResuming = useRef(false);
    const { isHovered, onPointerOver, onPointerOut } = useAgentDroneHover({ hideDelayMs: 150 });
    const noiseSeed = useMemo(() => {
        let h = 2166136261;
        for (let i = 0; i < id.length; i++) {
            h ^= id.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967295;
    }, [id]);
    const baseTone = useMemo(() => new THREE.Color(), []);
    const emissiveTone = useMemo(() => new THREE.Color(), []);
    const dangerTone = useMemo(() => new THREE.Color(LOG_LEVELS.critical.color), []);

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

    const orbitSeed = typeof (agentData as any)?.orbit?.seed === 'number' ? (agentData as any).orbit.seed : null;
    const orbitSpawnTime = typeof (agentData as any)?.orbit?.spawnTime === 'number' ? (agentData as any).orbit.spawnTime : null;
    const orbitTotalPausedMs = typeof (agentData as any)?.orbit?.totalPausedMs === 'number' ? (agentData as any).orbit.totalPausedMs : 0;

    useEffect(() => {
        if (orbitSeed === null || orbitSpawnTime === null) return;
        const activeTime = Math.max(0, Date.now() - orbitSpawnTime - orbitTotalPausedMs);
        const p = getOrbitPosition(orbitSeed, activeTime);
        currentPos.current.set(p[0], p[1], p[2]);
        targetVec.current.set(p[0], p[1], p[2]);
        if (groupRef.current && !(isPaused || isGlobalStopped)) {
            groupRef.current.position.copy(currentPos.current);
        }
    }, [orbitSeed, orbitSpawnTime, orbitTotalPausedMs, isPaused, isGlobalStopped]);

    useAgentDroneFrame({
        groupRef,
        bodyRef,
        materialRef,
        currentPos,
        targetVec,
        isResuming,
        position,
        agentData,
        orbitSeed,
        orbitSpawnTime,
        orbitTotalPausedMs,
        isPaused,
        isGlobalStopped,
        isForced,
        isOverride,
        isLocked,
        isPriority,
        isSelected,
        reducedEffects,
        isHovered,
        noiseSeed,
        color,
        coreColor,
        isDark,
        baseTone,
        emissiveTone,
        dangerTone,
    });

    const recentLogs = useAgentDroneRecentLogs({ logs: state?.logs || [], agentUuid, agentData });

    return (
        <>
            {isGlobalStopped && (
                <AgentDroneStopDots id={id} currentPos={currentPos.current} color={coreColor} />
            )}

            <group ref={groupRef}>
                <mesh
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        onPointerOver();
                    }}
                    onPointerOut={(e) => {
                        e.stopPropagation();
                        onPointerOut();
                    }}
                    onClick={(e) => { 
                    e.stopPropagation(); 
                    onClick(id); 
                }}>
                    <sphereGeometry args={[1.5, 8, 8]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

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

                <AgentDroneLabel 
                    displayId={displayId} isDark={isDark} isLocked={isLocked}
                    isSelected={isSelected} isPaused={isPaused || isGlobalStopped}
                    isPriority={isPriority} isOverride={isOverride}
                />

                {isHovered && agentData && (
                    <AgentDroneRiskTooltip agentData={agentData} isDark={isDark} />
                )}

                <AgentDroneRecentLogPills logs={recentLogs} />

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
                        isCompact={isCompact}
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

