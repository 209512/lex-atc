import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, HardDrive } from 'lucide-react';

interface MetricVector {
  latency: number;
  conflictRate: number;
  balanceDrain: number;
  anomalyScore: number;
  arweaveTxId?: string;
}

interface SlashingHeatmapProps {
  agentId: string;
  metrics: MetricVector;
  isVisible: boolean;
}

export const SlashingHeatmap: React.FC<SlashingHeatmapProps> = ({ agentId, metrics, isVisible }) => {
  if (!isVisible) return null;

  const getColor = (value: number, threshold: number) => {
    if (value >= threshold) return 'bg-red-500/80 text-white';
    if (value >= threshold * 0.7) return 'bg-orange-400/80 text-white';
    return 'bg-emerald-500/80 text-white';
  };

  return (
    <div className="absolute top-24 right-6 w-80 bg-slate-900/95 border border-red-500/30 rounded-lg p-4 shadow-2xl backdrop-blur-md z-50">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
        <AlertTriangle className="text-red-400 w-5 h-5" />
        <h3 className="font-mono text-sm font-bold text-slate-200">SLASHING JUSTIFICATION</h3>
      </div>
      
      <div className="space-y-3 font-mono text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Target Agent:</span>
          <span className="text-amber-400">{agentId}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="flex flex-col gap-1">
            <span className="text-slate-500 text-[10px]">Conflict Rate</span>
            <div className={clsx("px-2 py-1 rounded text-center", getColor(metrics.conflictRate, 0.8))}>
              {(metrics.conflictRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500 text-[10px]">Balance Drain</span>
            <div className={clsx("px-2 py-1 rounded text-center", getColor(metrics.balanceDrain, 50))}>
              {metrics.balanceDrain.toFixed(1)}%
            </div>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <span className="text-slate-500 text-[10px]">AI Anomaly Score (Isolation Forest)</span>
            <div className={clsx("px-2 py-1 rounded text-center font-bold", getColor(metrics.anomalyScore, 0.85))}>
              {metrics.anomalyScore.toFixed(3)}
            </div>
          </div>
        </div>

        {metrics.arweaveTxId && (
          <div className="mt-4 pt-3 border-t border-slate-700 bg-black/30 p-2 rounded flex items-start gap-2">
            <HardDrive className="text-blue-400 w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400">Immutable Audit Trail (Arweave)</span>
              <a 
                href={`https://viewblock.io/arweave/tx/${metrics.arweaveTxId}`}
                target="_blank"
                rel="noreferrer" 
                className="text-[10px] text-blue-400 hover:text-blue-300 truncate w-60 block"
              >
                {metrics.arweaveTxId}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
