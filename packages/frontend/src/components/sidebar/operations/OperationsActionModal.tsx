import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Gavel, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useModalStore } from '@/store/ui/modalStore';
import { useATCStore } from '@/store/atc';
import { atcApi } from '@/contexts/atcApi';
import { useUIStore } from '@/store/ui';

export const OperationsActionModal = () => {
  const { operationsModalOpen, operationsTargetId, operationsActionType, closeOperationsModal } = useModalStore();
  const isDark = useUIStore(s => s.isDark);
  const { addLog, playAlert, playClick } = useATCStore();
  
  const [reason, setReason] = useState('OPS_ACTION');
  const [threshold, setThreshold] = useState('1');
  const [timelock, setTimelock] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!operationsModalOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    playClick();
    try {
      if (['slash', 'dispute'].includes(operationsActionType)) {
        // Settlement Actions
        // Note: For settlement actions triggered from agent cards, operationsTargetId is the agentId.
        // We might not know the channelId directly here, but the backend accepts empty channelId if actorUuid is provided.
        const channelId = ''; 
        if (operationsActionType === 'slash') {
           await atcApi.slashSettlement(channelId, operationsTargetId, reason);
           addLog(`SLASH_EXECUTED on ${operationsTargetId}`, 'critical', 'SYSTEM');
        } else {
           await atcApi.openDispute(channelId, operationsTargetId, undefined, reason);
           addLog(`DISPUTE_OPENED for ${operationsTargetId}`, 'warn', 'SYSTEM');
        }
      } else {
        // Governance Actions
        let action = operationsActionType.toUpperCase();
        const params = { targetId: operationsTargetId };
        
        await atcApi.createProposal({
          action,
          params,
          timelockMs: Number(timelock || 0),
          threshold: Number(threshold || 1),
          reason: reason || 'OPS_PANEL_PROPOSAL',
        });
        addLog(`PROPOSAL_CREATED ${action} for ${operationsTargetId}`, 'policy', 'SYSTEM');
      }
      closeOperationsModal();
    } catch (err: any) {
      playAlert();
      addLog(`ACTION_FAILED: ${err.message}`, 'error', 'SYSTEM');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isGov = !['slash', 'dispute'].includes(operationsActionType);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={clsx(
        "w-full max-w-sm rounded-xl border p-6 shadow-2xl transition-all",
        isDark ? "bg-[#0d1117] border-gray-800 text-gray-200" : "bg-white border-slate-200 text-slate-800"
      )}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-orange-500" size={18} />
            <h2 className="text-sm font-bold font-mono tracking-widest uppercase">
              {isGov ? 'Governance Proposal' : 'Settlement Action'}
            </h2>
          </div>
          <button onClick={closeOperationsModal} className="p-1 hover:bg-white/10 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 font-mono text-xs">
          <div>
            <label className="block opacity-60 mb-1">Action Type</label>
            <div className="p-2 border rounded bg-black/20 uppercase font-bold text-orange-400 border-orange-500/30">
              {operationsActionType.replace('_', ' ')}
            </div>
          </div>

          <div>
            <label className="block opacity-60 mb-1">Target ID / Channel</label>
            <div className="p-2 border rounded bg-black/20 truncate">
              {operationsTargetId || 'GLOBAL'}
            </div>
          </div>

          <div>
            <label className="block opacity-60 mb-1">Reason</label>
            <input 
              type="text" 
              value={reason} 
              onChange={e => setReason(e.target.value.toUpperCase())}
              className={clsx("w-full p-2 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500", isDark ? "bg-black/30 border-gray-700" : "bg-slate-50 border-slate-300")}
            />
          </div>

          {isGov && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block opacity-60 mb-1">Threshold</label>
                <input 
                  type="number" 
                  value={threshold} 
                  onChange={e => setThreshold(e.target.value)}
                  className={clsx("w-full p-2 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500", isDark ? "bg-black/30 border-gray-700" : "bg-slate-50 border-slate-300")}
                />
              </div>
              <div>
                <label className="block opacity-60 mb-1">Timelock (ms)</label>
                <input 
                  type="number" 
                  value={timelock} 
                  onChange={e => setTimelock(e.target.value)}
                  className={clsx("w-full p-2 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500", isDark ? "bg-black/30 border-gray-700" : "bg-slate-50 border-slate-300")}
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <button 
              onClick={closeOperationsModal}
              className={clsx("px-4 py-2 rounded border transition-colors", isDark ? "border-gray-700 hover:bg-gray-800" : "border-slate-300 hover:bg-slate-100")}
            >
              CANCEL
            </button>
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold transition-colors flex items-center gap-2"
            >
              {isSubmitting ? 'PROCESSING...' : 'SUBMIT'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
