// src/components/common/Tooltip.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useUIStore } from '@/store/ui';

interface TooltipProps {
    children: React.ReactNode;
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-right';
    delay?: number;
    className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
    children, 
    content, 
    position = 'top', 
    delay = 200,
    className
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const isDark = useUIStore(s => s.isDark);
    const areTooltipsEnabled = useUIStore(s => s.areTooltipsEnabled);

    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const updatePosition = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            let top = 0, left = 0;
            const offset = 10;

            switch (position) {
                case 'top': top = rect.top - offset; left = rect.left + rect.width / 2; break;
                case 'bottom': top = rect.bottom + offset; left = rect.left + rect.width / 2; break;
                case 'left': top = rect.top + rect.height / 2; left = rect.left - offset; break;
                case 'right': top = rect.top + rect.height / 2; left = rect.right + offset; break;
                case 'bottom-left': top = rect.bottom + offset; left = rect.right; break;
                case 'bottom-right': top = rect.bottom + offset; left = rect.left; break;
            }
            
            // Adjust left to prevent overflowing the right edge of the screen
            // We don't have the tooltip width here, so we will use CSS max-width and right bounds
            // But we can just use CSS to prevent overflow by ensuring it doesn't go off-screen.
            
            setCoords({ top, left });
        }
    }, [position]);

    const show = () => { 
        if (areTooltipsEnabled && content) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => { updatePosition(); setIsVisible(true); }, delay); 
        }
    };
    
    const hide = () => { 
        if (timeoutRef.current) clearTimeout(timeoutRef.current); 
        setIsVisible(false); 
    };

    useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, updatePosition]);

    const tooltipStyles: Record<string, string> = {
        top: '-translate-x-1/2 -translate-y-full',
        bottom: '-translate-x-1/2',
        left: '-translate-x-full -translate-y-1/2',
        right: '-translate-y-1/2',
        'bottom-left': '-translate-x-full',
        'bottom-right': '',
    };

    return (
        <div ref={triggerRef} className={clsx("relative inline-block", className)} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
            {children}
            {isVisible && areTooltipsEnabled && createPortal(
                <div 
                    className={clsx(
                        "fixed px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap pointer-events-none backdrop-blur-md shadow-2xl border transition-all duration-150 z-[9999]",
                        tooltipStyles[position],
                        isDark 
                            ? "bg-black/90 text-blue-400 border-blue-500/40" 
                            : "bg-slate-800 text-white border-slate-700 shadow-lg"
                    )}
                    style={{ top: coords.top, left: coords.left }}
                >
                    {content}
                </div>,
                document.body
            )}
        </div>
    );
};