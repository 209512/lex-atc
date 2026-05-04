import React from 'react';
import clsx from 'clsx';
import { Star, Zap, Pause, Activity } from 'lucide-react';
import { LOG_LEVELS } from '@/utils/logStyles';

interface AgentStatusBadgeProps {
    isLocked: boolean;
    isPaused: boolean;
    isForced: boolean;
    isPriority: boolean;
    className?: string;
}

export const AgentStatusBadge = ({ 
    isLocked, 
    isPaused, 
    isForced, 
    isPriority, 
    className 
}: AgentStatusBadgeProps) => {
    return (
        <div className={clsx("flex items-center gap-1", className)}>
            {isPriority && (
                <Star size={12} className="animate-pulse" style={{ color: LOG_LEVELS.warn.color, fill: LOG_LEVELS.warn.color }} />
            )}
            
            {isPaused ? (
                <span className="flex items-center gap-1 text-[9px] px-1 rounded border" style={{ color: LOG_LEVELS.system.color, borderColor: LOG_LEVELS.system.color + '40', backgroundColor: LOG_LEVELS.system.color + '1A' }}>
                    <Pause size={8} /> STOPPED
                </span>
            ) : 
            isLocked ? (
                <span className="flex items-center gap-1 text-[9px] px-1 rounded border animate-pulse font-bold" style={{ color: LOG_LEVELS.success.color, borderColor: LOG_LEVELS.success.color + '40', backgroundColor: LOG_LEVELS.success.color + '1A' }}>
                    <Activity size={8} /> LIVE_LOCK
                </span>
            ) : 
            isForced ? (
                <span className="flex items-center gap-1 text-[9px] px-1 rounded border animate-pulse font-bold" style={{ color: LOG_LEVELS.system.color, borderColor: LOG_LEVELS.system.color + '40', backgroundColor: LOG_LEVELS.system.color + '1A' }}>
                    <Zap size={8} className="fill-current" /> SEIZING
                </span>
            ) : null}
        </div>
    );
};
