// src/components/monitoring/radar/RadarBackground.tsx
import React, { useMemo } from 'react';
import * as THREE from 'three';

interface RadarBackgroundProps {
  isDark: boolean;
}

export const RadarBackground = ({ isDark }: RadarBackgroundProps) => {
    const count = 3000;
    const [positions, colors] = useMemo(() => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const color = new THREE.Color();
      
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
        
        color.setHex(isDark ? 0x444444 : 0x94a3b8);
        
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      return [positions, colors];
    }, [isDark]);
  
    if (!positions || positions.length === 0) return null;
  
    return (
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={colors.length / 3}
            array={colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.15}
          vertexColors
          transparent
          opacity={isDark ? 0.8 : 0.4}
          sizeAttenuation
          depthWrite={false}
          blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </points>
    );
};