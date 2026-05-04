import { useEffect, useRef, useState } from 'react';

export const useAgentDroneHover = ({ hideDelayMs = 150 }: { hideDelayMs?: number } = {}) => {
  const [isHovered, setIsHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const onPointerOver = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const onPointerOut = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setIsHovered(false), hideDelayMs);
  };

  return { isHovered, onPointerOver, onPointerOut };
};

