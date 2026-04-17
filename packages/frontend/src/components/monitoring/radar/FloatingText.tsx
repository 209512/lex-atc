// frontend/src/components/monitoring/radar/FloatingText.tsx
import React, { useState, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

interface FloatingTextProps {
    text: string;
    color?: string;
    onComplete: () => void;
}

export const FloatingText = ({ text, color = "#fbbf24", onComplete }: FloatingTextProps) => {
    const [yOffset, setYOffset] = useState(0);
    const [opacity, setOpacity] = useState(1);

    useFrame((_, delta) => {
        setYOffset(prev => prev + delta * 0.8);
        setOpacity(prev => Math.max(0, prev - delta * 0.7));
    });

    useEffect(() => {
        const timer = setTimeout(onComplete, 1500);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <Html position={[0, 1 + yOffset, 0]} center style={{ pointerEvents: 'none' }}>
            <div 
                className="font-mono font-black whitespace-nowrap text-[12px] filter drop-shadow-md"
                style={{ color, opacity, transform: `scale(${1 + yOffset * 0.5})` }}
            >
                {text}
            </div>
        </Html>
    );
};