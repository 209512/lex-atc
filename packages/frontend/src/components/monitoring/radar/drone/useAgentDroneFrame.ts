import type React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getOrbitPosition } from '@/utils/orbit';

export const useAgentDroneFrame = ({
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
}: {
  groupRef: React.RefObject<THREE.Group | null>;
  bodyRef: React.RefObject<THREE.Mesh | null>;
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  currentPos: React.MutableRefObject<THREE.Vector3>;
  targetVec: React.MutableRefObject<THREE.Vector3>;
  isResuming: React.MutableRefObject<boolean>;
  position: [number, number, number];
  agentData: any;
  orbitSeed: number | null;
  orbitSpawnTime: number | null;
  orbitTotalPausedMs: number;
  isPaused: boolean;
  isGlobalStopped: boolean;
  isForced: boolean;
  isOverride: boolean;
  isLocked: boolean;
  isPriority: boolean;
  isSelected: boolean;
  reducedEffects: boolean;
  isHovered: boolean;
  noiseSeed: number;
  color: string;
  coreColor: string;
  isDark: boolean;
  baseTone: THREE.Color;
  emissiveTone: THREE.Color;
  dangerTone: THREE.Color;
}) => {
  useFrame((frameState) => {
    if (!groupRef.current) return;

    const effectivelyPaused = isPaused || isGlobalStopped;
    const rv = agentData?.riskVector;
    const riskVector: number[] = Array.isArray(rv) && rv.length === 8 ? rv : [0, 0, 0, 0, 0, 0, 0, 0];
    const threat = typeof riskVector[0] === 'number' && Number.isFinite(riskVector[0]) ? riskVector[0] : 0;
    const entropy = typeof riskVector[2] === 'number' && Number.isFinite(riskVector[2]) ? riskVector[2] : 0;
    const impact = typeof riskVector[5] === 'number' && Number.isFinite(riskVector[5]) ? riskVector[5] : 0;
    const timing = typeof riskVector[7] === 'number' && Number.isFinite(riskVector[7]) ? riskVector[7] : 0;

    if (effectivelyPaused) {
      groupRef.current.position.copy(currentPos.current);
    } else {
      if (orbitSeed !== null && orbitSpawnTime !== null) {
        const activeTime = Math.max(0, Date.now() - orbitSpawnTime - orbitTotalPausedMs);
        const p = getOrbitPosition(orbitSeed, activeTime);
        targetVec.current.set(p[0], p[1], p[2]);
      } else {
        targetVec.current.set(position[0], position[1], position[2]);
      }

      const lerpFactor = isResuming.current ? 0.02 : 0.06;
      groupRef.current.position.lerp(targetVec.current, lerpFactor);
      const baseY = groupRef.current.position.y;
      currentPos.current.copy(groupRef.current.position);

      const baseRot = reducedEffects ? 0.006 : 0.012 + timing * 0.09;
      const rotSpeed = isForced ? baseRot + 0.08 : baseRot;
      groupRef.current.rotation.y += rotSpeed;
      if (!reducedEffects) {
        if (isHovered) groupRef.current.position.y = baseY;
        else groupRef.current.position.y = baseY + Math.sin(frameState.clock.elapsedTime * 0.8) * 0.0015;
      }
    }

    const impactScale = 1 + Math.max(0, Math.min(1, impact)) * 1.5;
    const pulseFactor = reducedEffects ? 0 : isOverride ? 12 : isForced ? 8 : isSelected || isPriority ? 3 : 0;
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
      if (!special) {
        baseTone.set(color || '#3b82f6');
        const hsl = { h: 0, s: 0, l: 0 };
        baseTone.getHSL(hsl);
        const s = Math.max(0.72, Math.min(1, hsl.s));
        const l = isDark ? Math.max(0.46, Math.min(0.62, hsl.l)) : Math.max(0.22, Math.min(0.45, hsl.l));
        baseTone.setHSL(hsl.h, s, l);

        emissiveTone.copy(baseTone).lerp(dangerTone, safeThreat);
        materialRef.current.color.copy(baseTone);
        materialRef.current.emissive.copy(emissiveTone);
        materialRef.current.emissiveIntensity = (isDark ? 0.85 : 0.55) + safeThreat * (isDark ? 1.8 : 1.4);
      } else {
        materialRef.current.color.set(coreColor);
        materialRef.current.emissive.set(coreColor);
        materialRef.current.emissiveIntensity = isPaused || isGlobalStopped ? 0.3 : 1.5;
      }
    }
  });
};

