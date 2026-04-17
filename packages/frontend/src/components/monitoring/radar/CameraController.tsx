import { useShallow } from 'zustand/react/shallow';
// src/components/monitoring/radar/CameraController.tsx
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useEffect } from 'react';
import { useUIStore } from '@/store/ui';

interface Props {
    targetPosition: [number, number, number] | null;
}

export const CameraController = ({ targetPosition }: Props) => {
    const { camera, controls } = useThree();
    const { selectedAgentId  } = useUIStore(useShallow(s => ({ selectedAgentId: s.selectedAgentId })));
    const targetVec = new THREE.Vector3();
    
    const isAutoZooming = useRef(false);
    const isUserInteracting = useRef(false);
    const lastSelectedId = useRef<string | null>(null);

    useEffect(() => {
        if (!controls) return;
        const orbit = controls as any;

        const handleStart = () => { 
            isUserInteracting.current = true; 
            // 사용자가 수동 조작을 시작하면 자동 줌 모드 해제
            isAutoZooming.current = false;
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
    }, [controls]);

    useEffect(() => {
        if (selectedAgentId) {
            if (selectedAgentId !== lastSelectedId.current) {
                isAutoZooming.current = true;
                isUserInteracting.current = false; 
                lastSelectedId.current = selectedAgentId;
            }
        } else {
            isAutoZooming.current = false;
            lastSelectedId.current = null;
        }
    }, [selectedAgentId]);

    useFrame(() => {
        if (!controls) return;
        const orbit = controls as any;

        // 사용자가 우클릭으로 화면을 옮기거나 회전 중일 때는 카메라 타겟을 강제로 고정하지 않음
        if (isUserInteracting.current) return;

        if (targetPosition) {
            targetVec.set(targetPosition[0], targetPosition[1], targetPosition[2]);
            orbit.target.lerp(targetVec, 0.1);

            if (isAutoZooming.current) {
                const desiredDistance = 15;
                const currentDistance = camera.position.distanceTo(targetVec);
                
                if (Math.abs(currentDistance - desiredDistance) < 0.2) {
                    isAutoZooming.current = false;
                } else {
                    const direction = new THREE.Vector3().subVectors(camera.position, targetVec).normalize();
                    const targetCameraPos = new THREE.Vector3().addVectors(targetVec, direction.multiplyScalar(desiredDistance));
                    camera.position.lerp(targetCameraPos, 0.05);
                }
            }
            orbit.update();
        }
    });

    return null;
};
