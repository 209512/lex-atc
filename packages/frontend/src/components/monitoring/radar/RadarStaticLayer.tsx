import React from 'react';
import { RadarBackground } from '@/components/monitoring/radar/RadarBackground';
import { CentralHub } from '@/components/monitoring/radar/CentralHub';

interface RadarStaticLayerProps {
  isDark: boolean;
  isLocked: boolean;
  isOverride: boolean;
}

export const RadarStaticLayer = ({ isDark, isLocked, isOverride }: RadarStaticLayerProps) => (
  <>
    <RadarBackground isDark={isDark} />
    <CentralHub
      isLocked={isLocked}
      isOverride={isOverride}
      holder={null}
      isDark={isDark}
      agents={[]}
    />
  </>
);
