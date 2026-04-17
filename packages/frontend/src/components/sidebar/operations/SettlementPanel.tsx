import React, { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { Scale } from 'lucide-react';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';
import { atcApi } from '@/contexts/atcApi';
import { formatId } from '@/utils/agentIdentity';
import { settlementHelp, settlementPresets } from '@/components/sidebar/opsConsoleConfig';
import { getSectionCardClass, getRowCardClass, getActionButtonClass, Spinner, getInputClass, getHelpPillClass, CommonPanelProps } from './opsUiHelpers';

export const SettlementPanel: React.FC<CommonPanelProps> = ({ isDark, busy, runAction }) => {
  const state = useATCStore(useShallow(s => s.state));
  const addLog = useATCStore(s => s.addLog);
  const [settlementActorId, setSettlementActorId] = useState('');
  const [settlementReason, setSettlementReason] = useState('OPS_PANEL_SETTLEMENT');
  const [settlementTargetNonce, setSettlementTargetNonce] = useState('');

  const channels = useMemo(
    () => [...((state.settlement?.channels || []) as any[])]
      .sort((a, b) => Number(b.lastUpdatedAt || 0) - Number(a.lastUpdatedAt || 0))
      .slice(0, 5),
    [state.settlement?.channels]
  );

  const applySettlementPreset = useCallback((preset: typeof settlementPresets[number]) => {
    setSettlementActorId(preset.values.actorUuid);
    setSettlementReason(preset.values.reason);
    setSettlementTargetNonce(preset.values.targetNonce);
  }, []);

  return (
    <section data-testid="ops-settlement" className={getSectionCardClass(isDark)}>
      <div className="flex items-center justify-between">
        <div className={clsx('flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.12em]', isDark ? 'text-emerald-200' : 'text-emerald-800')}>
          <Scale size={11} />
          Settlement
        </div>
        <span className={clsx('text-[9px] font-mono', isDark ? 'text-gray-500' : 'text-slate-500')}>
          {channels.length} channels
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <div className={clsx('text-[9px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
          Presets
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {settlementPresets.map((preset) => (
            <button key={preset.label} onClick={() => applySettlementPreset(preset)} className={getHelpPillClass(isDark)}>
              <span className="font-bold">{preset.label}</span> · {preset.description}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1">
          {settlementHelp.map((item) => (
            <div key={item.label} className={getHelpPillClass(isDark)}>
              <span className="font-bold uppercase">{item.label}</span> · {item.detail}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          value={settlementActorId}
          onChange={(e) => setSettlementActorId(e.target.value)}
          placeholder="Actor ID"
          className={getInputClass(isDark)}
        />
        <input
          value={settlementTargetNonce}
          onChange={(e) => setSettlementTargetNonce(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Target Nonce"
          className={getInputClass(isDark)}
        />
        <input
          value={settlementReason}
          onChange={(e) => setSettlementReason(e.target.value.toUpperCase())}
          placeholder="Reason"
          className={getInputClass(isDark)}
        />
      </div>
      {channels.length === 0 && (
        <div className={clsx('text-[10px] font-mono opacity-60', isDark ? 'text-gray-500' : 'text-slate-500')}>
          No settlement channels.
        </div>
      )}
      {channels.map((channel: any) => {
        const channelId = String(channel.channelId);
        const disputeKey = `dispute:${channelId}`;
        const slashKey = `slash:${channelId}`;
        return (
          <div key={channelId} className={getRowCardClass(isDark)}>
            <div className="flex items-center justify-between gap-2">
              <div className={clsx('min-w-0 text-[10px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
                {formatId(channelId)}
              </div>
              <span className={clsx('text-[9px] font-mono shrink-0', channel.disputed ? 'text-red-500' : (isDark ? 'text-gray-500' : 'text-slate-500'))}>
                {channel.lastStatus || 'UNKNOWN'}
              </span>
            </div>
            <div className={clsx('mt-1 text-[9px] font-mono opacity-70 truncate', isDark ? 'text-gray-400' : 'text-slate-600')}>
              nonce {channel.lastNonce ?? 0} · {channel.disputed ? 'disputed' : 'healthy'}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                data-testid={`settle-dispute-${channelId}`}
                disabled={busy[disputeKey]}
                onClick={() => runAction({
                  key: disputeKey,
                  execute: () => atcApi.openDispute(channelId, settlementActorId || undefined, settlementTargetNonce ? Number(settlementTargetNonce) : undefined, settlementReason || 'OPS_PANEL_DISPUTE'),
                  errorLabel: 'SETTLEMENT_DISPUTE_FAILED',
                  requestMessage: `SETTLEMENT_DISPUTE_REQUESTED ${channelId}`,
                  successMessage: `SETTLEMENT_DISPUTE_OPENED ${channelId}`,
                  successType: 'warn',
                  successStage: 'executed',
                  domain: 'settlement',
                  actionKey: 'SETTLEMENT_DISPUTE',
                }).catch(e => {
                    console.error('Dispute Action Failed', e);
                    addLog(`Dispute Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'settlement', actionKey: 'SETTLEMENT_DISPUTE' });
                })}
                className={getActionButtonClass(isDark, 'warn')}
              >
                {busy[disputeKey] ? <Spinner /> : 'Dispute'}
              </button>
              <button
                data-testid={`settle-slash-${channelId}`}
                disabled={busy[slashKey]}
                onClick={() => runAction({
                  key: slashKey,
                  execute: () => atcApi.slashSettlement(channelId, settlementActorId || undefined, settlementReason || 'OPS_PANEL_SLASH'),
                  errorLabel: 'SETTLEMENT_SLASH_FAILED',
                  requestMessage: `SETTLEMENT_SLASH_REQUESTED ${channelId}`,
                  successMessage: `SETTLEMENT_SLASH_RECORDED ${channelId}`,
                  successType: 'critical',
                  successStage: 'executed',
                  domain: 'settlement',
                  actionKey: 'SETTLEMENT_SLASH',
                }).catch(e => {
                    console.error('Slash Action Failed', e);
                    addLog(`Slash Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'settlement', actionKey: 'SETTLEMENT_SLASH' });
                })}
                className={getActionButtonClass(isDark, 'critical')}
              >
                {busy[slashKey] ? <Spinner /> : 'Slash'}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
};
