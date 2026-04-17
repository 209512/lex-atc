import React from 'react';
import { createPortal } from 'react-dom';
import { Shield, Zap, Lock, X } from 'lucide-react';
import { useATCStore } from '@/store/atc';

export const PolicyTemplateModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const { actions } = useATCStore();
  const executeGovernanceAction = actions?.executeGovernanceAction || (async () => {});

  if (!isOpen) return null;

  const applyTemplate = (templateName: string) => {
    let config = {};
    if (templateName === 'STRICT_DEFI') {
        config = { maxLeaseMs: 2000, requireSandbox: true, minBid: 100, disputeWindow: 120 };
    } else if (templateName === 'HIGH_THROUGHPUT') {
        config = { maxLeaseMs: 15000, requireSandbox: false, minBid: 0, disputeWindow: 30 };
    } else if (templateName === 'DEFENSIVE') {
        config = { maxLeaseMs: 5000, requireSandbox: true, minBid: 500, disputeWindow: 300 };
    }

    executeGovernanceAction('UPDATE_GLOBAL_POLICY', { config });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0b0e14] border border-slate-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-800">
          <h2 className="text-lg font-bold font-mono text-slate-200">1-CLICK POLICY TEMPLATES</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Strict DeFi */}
          <div 
            onClick={() => applyTemplate('STRICT_DEFI')}
            className="border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 p-5 rounded-lg cursor-pointer transition-all group"
          >
            <Shield className="text-blue-400 w-8 h-8 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-blue-100 mb-1">STRICT DEFI</h3>
            <p className="text-xs text-slate-400 mb-4 h-12">Maximum security for financial agents. All irreversible intents sandboxed.</p>
            <ul className="text-[10px] font-mono text-blue-300/70 space-y-1">
              <li>• Max Lease: 2s</li>
              <li>• Sandbox: Forced</li>
              <li>• Dispute Window: 120s</li>
            </ul>
          </div>

          {/* High Throughput */}
          <div 
            onClick={() => applyTemplate('HIGH_THROUGHPUT')}
            className="border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 p-5 rounded-lg cursor-pointer transition-all group"
          >
            <Zap className="text-emerald-400 w-8 h-8 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-emerald-100 mb-1">MAX THROUGHPUT</h3>
            <p className="text-xs text-slate-400 mb-4 h-12">For web-scraping or data agents. Optimistic execution, zero sandbox.</p>
            <ul className="text-[10px] font-mono text-emerald-300/70 space-y-1">
              <li>• Max Lease: 15s</li>
              <li>• Sandbox: Disabled</li>
              <li>• Dispute Window: 30s</li>
            </ul>
          </div>

          {/* Defensive */}
          <div 
            onClick={() => applyTemplate('DEFENSIVE')}
            className="border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 p-5 rounded-lg cursor-pointer transition-all group"
          >
            <Lock className="text-red-400 w-8 h-8 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-red-100 mb-1">DEFENSIVE LOCKDOWN</h3>
            <p className="text-xs text-slate-400 mb-4 h-12">High bid minimums to prevent spam. Long dispute windows.</p>
            <ul className="text-[10px] font-mono text-red-300/70 space-y-1">
              <li>• Max Lease: 5s</li>
              <li>• Min Bid: 500 tokens</li>
              <li>• Dispute Window: 300s</li>
            </ul>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};
