import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const useAgentDetailPopupDrag = ({
  agentKey,
  baseY,
}: {
  agentKey: string;
  baseY: number;
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: baseY });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: baseY });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    offsetRef.current = { x: 0, y: baseY };
    setOffset(offsetRef.current);
    dragRef.current.active = false;
  }, [agentKey, baseY]);

  useLayoutEffect(() => {
    if (!agentKey) return;
    const el = popupRef.current;
    if (!el) return;
    const pad = 10;

    const apply = (next: { x: number; y: number }) => {
      el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    };

    const clamp = () => {
      let dx = offsetRef.current.x;
      let dy = offsetRef.current.y;
      apply({ x: dx, y: dy });

      const rect = el.getBoundingClientRect();
      if (rect.top < pad) dy += pad - rect.top;
      if (rect.bottom > window.innerHeight - pad) dy -= rect.bottom - (window.innerHeight - pad);
      if (rect.left < pad) dx += pad - rect.left;
      if (rect.right > window.innerWidth - pad) dx -= rect.right - (window.innerWidth - pad);
      if (dx !== offsetRef.current.x || dy !== offsetRef.current.y) {
        offsetRef.current = { x: dx, y: dy };
        apply(offsetRef.current);
        setOffset(offsetRef.current);
      }
    };

    const raf = requestAnimationFrame(clamp);
    window.addEventListener('resize', clamp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', clamp);
    };
  }, [agentKey]);

  const startDrag = (e: React.PointerEvent) => {
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = offsetRef.current.x;
    const originY = offsetRef.current.y;
    let moved = false;

    dragRef.current = { active: false, startX, startY, originX, originY };

    const commitTransform = () => {
      rafRef.current = null;
      const el = popupRef.current;
      if (el) el.style.transform = `translate3d(${offsetRef.current.x}px, ${offsetRef.current.y}px, 0)`;
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      dragRef.current.active = true;
      offsetRef.current = { x: originX + dx, y: originY + dy };
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(commitTransform);
    };

    const finish = () => {
      dragRef.current.active = false;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      try {
        target.releasePointerCapture(pointerId);
      } catch (err) {
        void err;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setOffset(offsetRef.current);
    };

    try {
      target.setPointerCapture(pointerId);
    } catch (err) {
      void err;
    }
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  };

  return { popupRef, offset, startDrag };
};

