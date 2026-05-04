import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { RadarInteractionHint } from '@/components/monitoring/radar/core/RadarInteractionHint';
import { RadarScene } from '@/components/monitoring/radar/core/RadarScene';

export const Radar: React.FC<{ compact?: boolean; isMainView?: boolean }> = ({ compact = false, isMainView = false }) => {
    const { agents, state  } = useATCStore(useShallow(s => ({ agents: s.agents, state: s.state })));
    const uiValues = useUIStore(useShallow(s => ({
        isDark: s.isDark, 
        selectedAgentId: s.selectedAgentId, 
        setSelectedAgentId: s.setSelectedAgentId,
        uiPreferences: s.uiPreferences
    })));
    const { isDark, selectedAgentId, setSelectedAgentId } = uiValues;

    return (
        <div 
            className="w-full h-full relative overflow-hidden transition-colors duration-500" 
            style={{ backgroundColor: isDark ? "#050505" : "#f8fafc" }}
        >
            {!compact && (
                <RadarInteractionHint isDark={isDark} />
            )}

            <RadarScene
                agents={agents}
                state={state}
                isDark={isDark}
                selectedAgentId={selectedAgentId}
                setSelectedAgentId={setSelectedAgentId}
                compact={compact}
                isMainView={isMainView}
                limitFps={!!uiValues.uiPreferences?.limitFps}
                reduceMotion={!!uiValues.uiPreferences?.reduceMotion}
            />
        </div>
    );
};

