import { useShallow } from 'zustand/react/shallow';
// src/components/monitoring/radar/CameraController.tsx
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useEffect } from 'react';
import { useUIStore } from '@/store/ui';
import { useATCStore } from '@/store/atc';
import { getOrbitPosition } from '@/utils/orbit';
import type { Agent } from '@/contexts/atcTypes';

interface Props {
    targetPosition: [number, number, number] | null;
    targetAgent?: Agent | null;
}

export const CameraController = ({ targetPosition, targetAgent }: Props) => {
    const { camera, controls } = useThree();
    const { selectedAgentId  } = useUIStore(useShallow(s => ({ selectedAgentId: s.selectedAgentId })));
    const { globalStop } = useATCStore(useShallow(s => ({ globalStop: !!s.state?.globalStop })));
    const targetVec = new THREE.Vector3();
    const initialCameraPos = useRef<THREE.Vector3 | null>(null);
    const initialTarget = useRef<THREE.Vector3 | null>(null);
    const lastValidTarget = useRef<THREE.Vector3 | null>(null);
    const shouldReset = useRef(false);
    
    const isAutoZooming = useRef(false);
    const isUserInteracting = useRef(false);
    const lastSelectedId = useRef<string | null>(null);

    useEffect(() => {
        if (!controls) return;
        const orbit = controls as any;
        if (!initialCameraPos.current) initialCameraPos.current = camera.position.clone();
        if (!initialTarget.current) initialTarget.current = orbit.target?.clone?.() ?? new THREE.Vector3();
        if (!lastValidTarget.current) lastValidTarget.current = orbit.target?.clone?.() ?? new THREE.Vector3();

        const handleStart = () => { 
            isUserInteracting.current = true; 
            // 사용자가 수동 조작을 시작하면 자동 줌 모드 해제
            isAutoZooming.current = false;
            shouldReset.current = false;
        };
        const handleEnd = () => { 
            isUserInteracting.current = false; 
        };

        orbit.addEventListener('start', handleStart);
        orbit.addEventListener('end', handleEnd);
        
        return () => {
            orbit.removeEventListener('start', handleStart);
            orbit.removeEventListener('end', handleEnd);
        };
    }, [controls, camera.position]);

    useEffect(() => {
        if (selectedAgentId) {
            if (selectedAgentId !== lastSelectedId.current) {
                isAutoZooming.current = true;
                isUserInteracting.current = false; 
                lastSelectedId.current = selectedAgentId;
            }
            shouldReset.current = false;
        } else {
            isAutoZooming.current = false;
            if (lastSelectedId.current) shouldReset.current = true;
            lastSelectedId.current = null;
        }
    }, [selectedAgentId]);

    useFrame(() => {
        if (!controls) return;
        const orbit = controls as any;

        // 사용자가 우클릭으로 화면을 옮기거나 회전 중일 때는 카메라 타겟을 강제로 고정하지 않음
        if (isUserInteracting.current) return;

        const agentPaused = String((targetAgent as any)?.status || '').toLowerCase() === 'paused' || (targetAgent as any)?.isPaused === true;
        const effectivePaused = globalStop || agentPaused;
        if (selectedAgentId && effectivePaused) {
            isAutoZooming.current = false;
            orbit.update();
            return;
        }

        const orbitSeed = typeof (targetAgent as any)?.orbit?.seed === 'number' ? (targetAgent as any).orbit.seed : null;
        const orbitSpawnTime = typeof (targetAgent as any)?.orbit?.spawnTime === 'number' ? (targetAgent as any).orbit.spawnTime : null;
        const orbitTotalPausedMs = typeof (targetAgent as any)?.orbit?.totalPausedMs === 'number' ? (targetAgent as any).orbit.totalPausedMs : 0;
        const hasOrbitTarget = orbitSeed !== null && orbitSpawnTime !== null;

        if (selectedAgentId) {
            let hasTarget = false;
            if (hasOrbitTarget) {
                const activeTime = Math.max(0, Date.now() - orbitSpawnTime - orbitTotalPausedMs);
                const p = getOrbitPosition(orbitSeed, activeTime);
                targetVec.set(p[0], p[1], p[2]);
                hasTarget = true;
            } else if (targetPosition) {
                targetVec.set(targetPosition[0], targetPosition[1], targetPosition[2]);
                hasTarget = true;
            } else if (lastValidTarget.current) {
                targetVec.copy(lastValidTarget.current);
            }
            if (hasTarget) lastValidTarget.current = targetVec.clone();
            orbit.target.lerp(targetVec, 0.1);

            if (isAutoZooming.current) {
                const desiredDistance = 15;
                const currentDistance = camera.position.distanceTo(targetVec);
                
                if (Math.abs(currentDistance - desiredDistance) < 0.2) {
                    isAutoZooming.current = false;
                } else {
                    const direction = new THREE.Vector3(1, 0.7, 1).normalize();
                    const targetCameraPos = new THREE.Vector3().addVectors(targetVec, direction.multiplyScalar(desiredDistance));
                    camera.position.lerp(targetCameraPos, 0.05);
                }
            }
            orbit.update();
        } else if (shouldReset.current && initialCameraPos.current && initialTarget.current) {
            orbit.target.lerp(initialTarget.current, 0.12);
            camera.position.lerp(initialCameraPos.current, 0.08);
            orbit.update();
            if (orbit.target.distanceTo(initialTarget.current) < 0.02 && camera.position.distanceTo(initialCameraPos.current) < 0.02) {
                shouldReset.current = false;
            }
        }
    });

    return null;
};
