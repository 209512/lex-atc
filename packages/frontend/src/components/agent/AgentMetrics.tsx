// src/components/agent/AgentMetrics.tsx
import React from 'react';
import { Zap, Clock, Hash, Activity } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import clsx from 'clsx';

interface MetricBoxProps {
    label: string;
    value: string | number;
    isDark: boolean;
    icon: React.ReactNode;
    tooltip: string;
}

const MetricBox = ({ label, value, isDark, icon, tooltip }: MetricBoxProps) => (
    <Tooltip content={tooltip} position="top" className="flex-1">
        <div className={clsx(
            "w-full flex flex-col items-center justify-center py-1.5 rounded-sm border min-w-[45px] h-11 shadow-sm transition-all", 
            isDark 
                ? "bg-black/40 border-white/5 hover:border-blue-500/30 group/metric" 
                : "bg-white border-slate-200 hover:border-blue-300 shadow-inner"
        )}>
            <div className="text-[7px] text-gray-500 uppercase font-black tracking-tighter flex items-center gap-1 leading-none mb-1 group-hover/metric:text-blue-400">
                {icon}{label}
            </div>
            <div className={clsx(
                "text-[10px] font-mono font-bold truncate leading-none", 
                isDark ? "text-gray-300" : "text-slate-800"
            )}>
                {value}
            </div>
        </div>
    </Tooltip>
);

export const AgentMetrics = ({ isDark, agent }: { isDark: boolean, agent?: any }) => {
    // 실제 데이터가 있다면 사용하고, 없다면 시뮬레이션 값 생성
    const metrics = React.useMemo(() => ({
        ts: agent?.metrics?.ts || (Math.random() * 15 + 35).toFixed(1),
        lat: agent?.metrics?.lat || (Math.random() * 50 + 150).toFixed(0),
        tot: agent?.metrics?.tot || (Math.random() * 2000 + 800).toFixed(0),
        load: agent?.metrics?.load || (Math.random() * 15 + 5).toFixed(1)
    }), [agent?.metrics?.ts, agent?.metrics?.load, agent?.metrics?.lat, agent?.metrics?.tot]);

    return (
        <div className="grid grid-cols-4 gap-1 mt-3">
            <MetricBox isDark={isDark} label="T/S" value={metrics.ts} icon={<Zap size={10}/>} tooltip="Tokens Per Second" />
            <MetricBox isDark={isDark} label="LAT" value={`${metrics.lat}ms`} icon={<Clock size={10}/>} tooltip="Latency" />
            <MetricBox isDark={isDark} label="TOT" value={metrics.tot} icon={<Hash size={10}/>} tooltip="Total Tokens" />
            <MetricBox isDark={isDark} label="LOAD" value={`${metrics.load}%`} icon={<Activity size={10}/>} tooltip="Compute Load" />
        </div>
    );
};