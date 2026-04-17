// src/hooks/system/useSidebarResize.ts
import React, { useState, useEffect, useRef } from 'react';

export const useSidebarResize = (initialWidth: number, setWidth: (w: number) => void) => {
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const resizerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            // 이전 프레임이 남아있다면 취소하여 성능 최적화 및 딜레이 제거
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }

            frameRef.current = requestAnimationFrame(() => {
                // 사이드바 너비 계산 (우측 배치 기준)
                const newWidth = window.innerWidth - e.clientX;
                
                let finalWidth = newWidth;
                
                if (newWidth < 40) {
                    finalWidth = 0; // 임계값 이하 시 닫기
                } else {
                    // 최소 250px, 최대 800px 범위 제한
                    finalWidth = Math.max(250, Math.min(newWidth, 800));
                }

                // 즉각적인 DOM 조작으로 반응성 극대화
                if (sidebarRef.current) {
                    sidebarRef.current.style.width = `${finalWidth === 0 ? 4 : finalWidth}px`;
                }

                setWidth(finalWidth);
            });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, setWidth]);

    return { sidebarRef, resizerRef, isResizing, handleMouseDown };
};