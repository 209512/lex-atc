import React, { useMemo } from 'react';
import * as THREE from 'three';

export const AgentDroneStopDots = ({
  id,
  currentPos,
  color,
}: {
  id: string;
  currentPos: THREE.Vector3;
  color: string;
}) => {
  const dots = useMemo(() => Array.from({ length: 12 }).map((_, i) => i), []);
  return (
    <group>
      {dots.map((i) => (
        <mesh key={`dot-${id}-${i}`} position={currentPos.clone().multiplyScalar((i + 1) / 13)}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
};

