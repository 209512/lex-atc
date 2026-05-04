import { useMemo } from 'react';

export const useAgentDroneRecentLogs = ({
  logs,
  agentUuid,
  agentData,
}: {
  logs: any[];
  agentUuid: string;
  agentData: any;
}) => {
  return useMemo(() => {
    const isSlashed = agentData?.slash === true;
    const baseLogs = (logs || [])
      .filter((l) => l.agentId === agentUuid && Date.now() - Number(l.timestamp) < 3000)
      .slice(-3);

    if (isSlashed) {
      baseLogs.push({
        id: `slash-${Date.now()}`,
        agentId: agentUuid,
        message: '💥 SLASHED',
        timestamp: Date.now(),
        type: 'critical',
      });
    }
    return baseLogs;
  }, [logs, agentUuid, agentData]);
};

