import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { Agent } from '@/contexts/atcTypes';
import { useATCStore } from '@/store/atc';
import { matchesAgentIdentity, getAgentLabel, formatId } from '@/utils/agentIdentity';
import { SYSTEM } from '@lex-atc/shared';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Ring } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CameraController } from './CameraController';
import { useIsMobile } from '@/hooks/system/useIsMobile';

const normalizePoint3D = (agent: Agent) => {
  const [x = 0, y = 0, z = 0] = (agent.position || [0, 0, 0]) as [number, number, number];
  const scale = 2; // adjust scale to fit the 3D space (-10 to 10)
  return new THREE.Vector3(x / scale, y / scale, z / scale);
};

export const RadarLite = () => {
  const agents = useATCStore(useShallow(s => s.agents));
  const holder = useATCStore(s => s.state.holder);
  const globalStop = useATCStore(s => s.state.globalStop);
  const priorityAgents = useATCStore(s => s.state.priorityAgents);
  const overrideSignal = useATCStore(s => s.state.overrideSignal);
  const { isDark, selectedAgentId, setSelectedAgentId     } = useUIStore(useShallow(s => ({ isDark: s.isDark, selectedAgentId: s.selectedAgentId, setSelectedAgentId: s.setSelectedAgentId })));
  const isMobile = useIsMobile();

  const holderLabel = useMemo(() => {
    if (!holder) return 'IDLE';
    if (holder === 'Human-Operator' || holder === SYSTEM.ADMIN_HOLDER_ID) return 'HUMAN';
    const holderAgent = agents.find((agent) => matchesAgentIdentity(agent, holder));
    return holderAgent ? getAgentLabel(holderAgent) : formatId(holder);
  }, [agents, holder]);

  const selectedAgent = useMemo(() => agents.find((agent) => matchesAgentIdentity(agent, selectedAgentId)), [agents, selectedAgentId]);

  return (
    <div className={clsx("absolute inset-0 overflow-hidden", isDark ? "bg-[#020617]" : "bg-slate-50")}>
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

        {/* Radar Rings */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <ringGeometry args={[5, 5.05, 64]} />
          <meshBasicMaterial color={isDark ? "#ffffff" : "#cbd5e1"} transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <ringGeometry args={[10, 10.05, 64]} />
          <meshBasicMaterial color={isDark ? "#ffffff" : "#cbd5e1"} transparent opacity={0.2} />
        </mesh>

        {/* Crosshairs */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <planeGeometry args={[22, 0.05]} />
          <meshBasicMaterial color={isDark ? "#ffffff" : "#cbd5e1"} transparent opacity={0.15} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, -2, 0]}>
          <planeGeometry args={[22, 0.05]} />
          <meshBasicMaterial color={isDark ? "#ffffff" : "#cbd5e1"} transparent opacity={0.15} />
        </mesh>

        {/* Agents */}
        {agents.map((agent) => {
          const point = normalizePoint3D(agent);
          const isSelected = matchesAgentIdentity(agent, selectedAgentId);
          const isLocked = matchesAgentIdentity(agent, holder);
          const isPaused = String((agent as any).status || '').toLowerCase() === 'paused' || agent.isPaused === true || globalStop;
          const isPriority = priorityAgents?.some(p => matchesAgentIdentity(agent, p));
          const l4PhaseRaw = String((agent as any).l4Phase || 'SANDBOX').toUpperCase();
          const l4Phase = (l4PhaseRaw === 'FINALIZED' || l4PhaseRaw === 'COMMIT') ? l4PhaseRaw : 'SANDBOX';
          const l4Color = l4Phase === 'FINALIZED' ? '#22c55e' : (l4Phase === 'COMMIT' ? '#3b82f6' : '#f59e0b');
          const l4Tag = l4Phase === 'FINALIZED' ? 'FNL' : (l4Phase === 'COMMIT' ? 'COM' : 'SBX');

          let color = "#3b82f6"; // blue-500
          if (overrideSignal) color = "#ef4444"; // red-500 (Emergency Takeover)
          else if (isLocked) color = "#10b981"; // emerald-500
          else if (isPaused) color = "#64748b"; // slate-500
          else if (isPriority) color = "#eab308"; // yellow-500

          const glowIntensity = (overrideSignal || isLocked) ? 2.5 : (isPaused ? 0.3 : 1.2);

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
              <meshStandardMaterial 
                color={color} 
                emissive={color}
                emissiveIntensity={glowIntensity}
                transparent 
                opacity={isPaused ? 0.5 : 0.9} 
              />
              <Ring args={[0.42, 0.5, 32]} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color={l4Color} transparent opacity={isPaused ? 0.15 : 0.55} />
              </Ring>
              
              {/* 미니 텍스트 라벨 (심미성 향상) */}
              <Html position={[0.4, 0.4, 0]} center style={{ pointerEvents: 'none' }}>
                <div className={clsx(
                  "text-[8px] font-mono px-1 py-0.5 rounded opacity-80 whitespace-nowrap",
                  isDark ? "bg-black/60 text-white" : "bg-white/80 text-slate-800 shadow-sm",
                  isPaused && "line-through opacity-50",
                  isSelected && "border border-blue-400 font-bold scale-110"
                )}>
                  {getAgentLabel(agent)} · {l4Tag}
                </div>
              </Html>
            </mesh>
          );
        })}

        {/* Center Marker */}
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial 
              color={overrideSignal ? "#ef4444" : "#10b981"} 
              emissive={overrideSignal ? "#ef4444" : "#10b981"}
              emissiveIntensity={overrideSignal ? 3 : 1}
            />
          </mesh>

          {/* Core Core pulse effect */}
          {overrideSignal && (
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.7, 32, 32]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.3} />
            </mesh>
          )}

          {/* Post Processing Bloom - 모바일 환경에서는 렌더링하지 않아 성능 확보 */}
          {!isMobile && (
            <EffectComposer>
              <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} />
            </EffectComposer>
          )}
        </Canvas>
      </React.Suspense>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-hud pointer-events-none">
        <div className={clsx(
          "px-6 py-2 rounded-full border backdrop-blur-md transition-colors shadow-lg flex flex-col items-center gap-1",
          isDark ? "bg-black/60 border-gray-800 text-gray-300" : "bg-white/80 border-slate-200 text-slate-700"
        )}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">HOLDER</span>
              <span className={clsx("text-xs font-mono font-bold", isDark ? "text-emerald-400" : "text-emerald-600")}>
                {holderLabel}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-500/30"></div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">SYSTEM</span>
              <span className="text-xs font-mono font-bold">{agents.length} AGENTS</span>
            </div>
            <div className="w-px h-4 bg-gray-500/30"></div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">FOCUS</span>
              <span className={clsx("text-xs font-mono font-bold", isDark ? "text-blue-400" : "text-blue-600")}>
                {selectedAgent ? `SEL ${getAgentLabel(selectedAgent)}` : 'NONE'}
              </span>
            </div>
          </div>
          <div className="text-[8px] font-mono opacity-40 uppercase tracking-[0.2em] flex gap-3">
            <span>[L-Click] Focus</span>
            <span>[Drag] Rotate</span>
            <span>[Scroll] Zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
};
