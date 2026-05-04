import React from 'react';
import clsx from 'clsx';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Ring } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Agent } from '@/contexts/atcTypes';
import { matchesAgentIdentity, getAgentLabel } from '@/utils/agentIdentity';
import { CameraController } from '@/components/monitoring/radar/core/CameraController';

const normalizePoint3D = (agent: Agent) => {
  const [x = 0, y = 0, z = 0] = (agent.position || [0, 0, 0]) as [number, number, number];
  const scale = 2;
  return new THREE.Vector3(x / scale, y / scale, z / scale);
};

export const RadarLiteScene = ({
  agents,
  holder,
  globalStop,
  priorityAgents,
  overrideSignal,
  isDark,
  isMobile,
  selectedAgentId,
  setSelectedAgentId,
}: {
  agents: Agent[];
  holder: string | null;
  globalStop: boolean;
  priorityAgents: any[];
  overrideSignal: boolean;
  isDark: boolean;
  isMobile: boolean;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string) => void;
}) => {
  const selectedAgent = agents.find((agent) => matchesAgentIdentity(agent, selectedAgentId));
  return (
    <React.Suspense fallback={null}>
      <Canvas camera={{ position: [0.01, 20, 0.01], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        <OrbitControls
          makeDefault
          enablePan={typeof window !== 'undefined' && window.innerWidth < 768 ? true : false}
          enableZoom={true}
          enableRotate={true}
          rotateSpeed={typeof window !== 'undefined' && window.innerWidth < 768 ? 0.8 : 0.5}
          zoomSpeed={typeof window !== 'undefined' && window.innerWidth < 768 ? 1.2 : 0.8}
        />
        <CameraController targetPosition={selectedAgent ? normalizePoint3D(selectedAgent).toArray() : null} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <ringGeometry args={[5, 5.05, 64]} />
          <meshBasicMaterial color={isDark ? '#ffffff' : '#cbd5e1'} transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <ringGeometry args={[10, 10.05, 64]} />
          <meshBasicMaterial color={isDark ? '#ffffff' : '#cbd5e1'} transparent opacity={0.2} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <planeGeometry args={[22, 0.05]} />
          <meshBasicMaterial color={isDark ? '#ffffff' : '#cbd5e1'} transparent opacity={0.15} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, -2, 0]}>
          <planeGeometry args={[22, 0.05]} />
          <meshBasicMaterial color={isDark ? '#ffffff' : '#cbd5e1'} transparent opacity={0.15} />
        </mesh>

        {agents.map((agent) => {
          const point = normalizePoint3D(agent);
          const isSelected = matchesAgentIdentity(agent, selectedAgentId);
          const isLocked = matchesAgentIdentity(agent, holder);
          const isPaused = String((agent as any).status || '').toLowerCase() === 'paused' || agent.isPaused === true || globalStop;
          const isPriority = priorityAgents?.some((p) => matchesAgentIdentity(agent, p));
          const l4PhaseRaw = String((agent as any).l4Phase || 'SANDBOX').toUpperCase();
          const l4Phase = l4PhaseRaw === 'FINALIZED' || l4PhaseRaw === 'COMMIT' ? l4PhaseRaw : 'SANDBOX';
          const l4Color = l4Phase === 'FINALIZED' ? '#22c55e' : l4Phase === 'COMMIT' ? '#3b82f6' : '#f59e0b';
          const l4Tag = l4Phase === 'FINALIZED' ? 'FNL' : l4Phase === 'COMMIT' ? 'COM' : 'SBX';

          let color = '#3b82f6';
          if (overrideSignal) color = '#ef4444';
          else if (isLocked) color = '#10b981';
          else if (isPaused) color = '#64748b';
          else if (isPriority) color = '#eab308';

          const glowIntensity = overrideSignal || isLocked ? 2.5 : isPaused ? 0.3 : 1.2;

          return (
            <mesh
              key={agent.uuid}
              position={point}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAgentId(agent.uuid);
              }}
              scale={isSelected ? [1.5, 1.5, 1.5] : [1, 1, 1]}
            >
              <sphereGeometry args={[0.3, 32, 32]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glowIntensity} transparent opacity={isPaused ? 0.5 : 0.9} />
              <Ring args={[0.42, 0.5, 32]} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color={l4Color} transparent opacity={isPaused ? 0.15 : 0.55} />
              </Ring>

              <Html position={[0.4, 0.4, 0]} center style={{ pointerEvents: 'none' }}>
                <div
                  className={clsx(
                    'text-[8px] font-mono px-1 py-0.5 rounded opacity-80 whitespace-nowrap',
                    isDark ? 'bg-black/60 text-white' : 'bg-white/80 text-slate-800 shadow-sm',
                    isPaused && 'line-through opacity-50',
                    isSelected && 'border border-blue-400 font-bold scale-110'
                  )}
                >
                  {getAgentLabel(agent)} · {l4Tag}
                </div>
              </Html>
            </mesh>
          );
        })}

        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color={overrideSignal ? '#ef4444' : '#10b981'} emissive={overrideSignal ? '#ef4444' : '#10b981'} emissiveIntensity={overrideSignal ? 3 : 1} />
        </mesh>

        {overrideSignal && (
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.7, 32, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.3} />
          </mesh>
        )}

        {!isMobile && (
          <EffectComposer>
            <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} />
          </EffectComposer>
        )}
      </Canvas>
    </React.Suspense>
  );
};

