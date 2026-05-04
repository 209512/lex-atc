import React, { Suspense, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Agent } from '@/contexts/atcTypes';
import { CameraController } from '@/components/monitoring/radar/core/CameraController';
import { RadarBackground } from '@/components/monitoring/radar/core/RadarBackground';
import { CentralHub } from '@/components/monitoring/radar/core/CentralHub';
import { RadarAgentLayer } from '@/components/monitoring/radar/core/RadarAgentLayer';

export const RadarScene = ({
  agents,
  state,
  isDark,
  selectedAgentId,
  setSelectedAgentId,
  compact,
  isMainView,
  limitFps,
  reduceMotion,
}: {
  agents: Agent[];
  state: any;
  isDark: boolean;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  compact: boolean;
  isMainView: boolean;
  limitFps: boolean;
  reduceMotion: boolean;
}) => {
  const selectedAgent = useMemo(
    () => agents.find((a) => a.uuid === selectedAgentId || a.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const targetPos = useMemo(() => {
    if (!selectedAgent) return null;
    return selectedAgent.position as [number, number, number];
  }, [selectedAgent]);

  const handleCreated = useCallback(({ gl }: any) => {
    gl.domElement.addEventListener(
      'webglcontextlost',
      (event: any) => {
        event.preventDefault();
      },
      false
    );
  }, []);

  return (
    <Canvas
      shadows
      onCreated={handleCreated}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        stencil: false,
      }}
      frameloop={limitFps ? 'demand' : 'always'}
      dpr={1}
      onPointerMissed={(e) => {
        const btn = (e as any).button ?? (e as any).nativeEvent?.button;
        if (btn === 0 || btn == null) setSelectedAgentId(null);
      }}
    >
      <>
        <PerspectiveCamera makeDefault position={[12, 12, 12]} fov={isMainView ? 45 : 60} />
        <OrbitControls
          makeDefault
          enableZoom={true}
          enablePan={true}
          maxDistance={60}
          minDistance={3}
          enableDamping={true}
          dampingFactor={0.08}
          autoRotate={!reduceMotion && !selectedAgentId}
          autoRotateSpeed={0.5}
          rotateSpeed={typeof window !== 'undefined' && window.innerWidth < 768 ? 0.8 : 0.5}
          zoomSpeed={typeof window !== 'undefined' && window.innerWidth < 768 ? 1.2 : 0.8}
        />

        <CameraController targetPosition={targetPos} targetAgent={selectedAgent} />

        <ambientLight intensity={isDark ? 0.4 : 0.8} />
        <pointLight position={[10, 15, 10]} intensity={1.5} />

        <Suspense fallback={null}>
          <RadarBackground isDark={isDark} />
          <CentralHub
            isLocked={!!state?.holder}
            isOverride={!!state?.overrideSignal}
            holder={state?.holder || null}
            isDark={isDark}
            agents={agents}
          />

          <RadarAgentLayer
            agents={agents}
            holder={state?.holder || null}
            overrideSignal={!!state?.overrideSignal}
            globalStop={!!state?.globalStop}
            onSelectAgent={(id) => setSelectedAgentId(id)}
            isCompact={compact}
          />
        </Suspense>
      </>
    </Canvas>
  );
};

