import React, { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { Gavel } from 'lucide-react';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';
import { atcApi } from '@/contexts/atcApi';
import { governanceHelp, governancePresets, proposalActionHelp, proposalActions } from '@/components/sidebar/opsConsoleConfig';
import { getSectionCardClass, getRowCardClass, getActionButtonClass, Spinner, getInputClass, getHelpPillClass, CommonPanelProps } from './opsUiHelpers';
import { buildProposalParams } from './opsUtils';

export const GovernancePanel: React.FC<CommonPanelProps> = ({ isDark, busy, runAction }) => {
  const state = useATCStore(useShallow(s => s.state));
  const { addLog, playAlert } = useATCStore(useShallow(s => ({
    addLog: s.addLog,
    playAlert: s.actions.playAlert
  })));
  const [governanceCancelReason, setGovernanceCancelReason] = useState('OPS_PANEL_CANCEL');
  const [proposalAction, setProposalAction] = useState<(typeof proposalActions)[number]>('TRANSFER_LOCK');
  const [proposalTargetId, setProposalTargetId] = useState('');
  const [proposalReason, setProposalReason] = useState('OPS_PANEL_PROPOSAL');
  const [proposalCount, setProposalCount] = useState('2');
  const [proposalPauseFlag, setProposalPauseFlag] = useState(true);
  const [proposalThreshold, setProposalThreshold] = useState('1');
  const [proposalTimelockMs, setProposalTimelockMs] = useState('0');

  const proposals = useMemo(
    () => ((state.governance?.proposals || []) as any[])
      .filter((proposal) => ['PENDING', 'READY'].includes(String(proposal.status || '')))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 5),
    [state.governance?.proposals]
  );

  const proposalHistory = useMemo(
    () => [...((state.governance?.proposals || []) as any[])]
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 8),
    [state.governance?.proposals]
  );

  const applyGovernancePreset = useCallback((preset: typeof governancePresets[number]) => {
    setProposalAction(preset.values.action as (typeof proposalActions)[number]);
    setProposalReason(preset.values.reason);
    setProposalThreshold(preset.values.threshold);
    setProposalTimelockMs(preset.values.timelockMs);
    setProposalCount(preset.values.count);
    setProposalPauseFlag(preset.values.pauseFlag);
  }, []);

  const createProposal = useCallback(async () => {
    const params = buildProposalParams({
      action: proposalAction,
      targetId: proposalTargetId.trim(),
      count: proposalCount,
      pause: proposalPauseFlag,
    });

    if (['TRANSFER_LOCK', 'TERMINATE_AGENT', 'PAUSE_AGENT'].includes(proposalAction) && !proposalTargetId.trim()) {
      playAlert();
      addLog('PROPOSAL_CREATE_FAILED: TARGET_ID_REQUIRED', 'error', 'SYSTEM', { stage: 'failed', domain: 'governance', actionKey: proposalAction });
      return;
    }

    await runAction({
      key: 'proposal-create',
      execute: () => atcApi.createProposal({
        action: proposalAction,
        params,
        timelockMs: Number(proposalTimelockMs || 0),
        threshold: Number(proposalThreshold || 1),
        reason: proposalReason || 'OPS_PANEL_PROPOSAL',
      }),
      errorLabel: 'PROPOSAL_CREATE_FAILED',
      requestMessage: `GOVERNANCE_PROPOSAL_REQUESTED ${proposalAction}`,
      successMessage: `GOVERNANCE_PROPOSAL_CREATED ${proposalAction}`,
      successType: 'policy',
      successStage: 'accepted',
      domain: 'governance',
      actionKey: proposalAction,
    }).catch(e => {
        addLog(`Proposal Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'governance', actionKey: proposalAction });
    });
  }, [addLog, playAlert, proposalAction, proposalCount, proposalPauseFlag, proposalReason, proposalTargetId, proposalThreshold, proposalTimelockMs, runAction]);

  return (
    <section data-testid="ops-governance" className={getSectionCardClass(isDark)}>
      <div className="flex items-center justify-between">
        <div className={clsx('flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.12em]', isDark ? 'text-amber-200' : 'text-amber-800')}>
          <Gavel size={11} />
          Governance
        </div>
        <span className={clsx('text-[9px] font-mono', isDark ? 'text-gray-500' : 'text-slate-500')}>
          {proposals.length} active
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <div className={clsx('text-[9px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
          Presets
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {governancePresets.map((preset) => (
            <button key={preset.label} data-testid={`gov-preset-${preset.label.replace(/\s+/g, '-').toLowerCase()}`} onClick={() => applyGovernancePreset(preset)} className={getHelpPillClass(isDark)}>
              <span className="font-bold">{preset.label}</span> · {preset.description}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={proposalAction}
          onChange={(e) => setProposalAction(e.target.value as (typeof proposalActions)[number])}
          className={getInputClass(isDark)}
        >
          {proposalActions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <input
          type="text"
          value={proposalTargetId}
          onChange={(e) => setProposalTargetId(e.target.value)}
          placeholder="Target ID (Optional)"
          className={getInputClass(isDark)}
        />
        <input
          value={proposalReason}
          onChange={(e) => setProposalReason(e.target.value.toUpperCase())}
          placeholder="Proposal Reason"
          className={getInputClass(isDark)}
        />
        <input
          value={governanceCancelReason}
          onChange={(e) => setGovernanceCancelReason(e.target.value.toUpperCase())}
          placeholder="Cancel Reason"
          className={getInputClass(isDark)}
        />
        <input
          value={proposalCount}
          onChange={(e) => setProposalCount(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Scale Count"
          className={getInputClass(isDark)}
        />
        <input
          value={proposalThreshold}
          onChange={(e) => setProposalThreshold(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Approval Threshold"
          className={getInputClass(isDark)}
        />
        <input
          value={proposalTimelockMs}
          onChange={(e) => setProposalTimelockMs(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Timelock (ms)"
          className={getInputClass(isDark)}
        />
        <button
          onClick={() => setProposalPauseFlag((prev) => !prev)}
          className={clsx(getInputClass(isDark), 'text-left')}
        >
          Flag: {proposalAction === 'TOGGLE_STOP' ? (proposalPauseFlag ? 'Enable Stop' : 'Disable Stop') : (proposalPauseFlag ? 'Pause: True' : 'Pause: False')}
        </button>
      </div>
      <div className="space-y-1">
        <div className={getHelpPillClass(isDark)}>
          <span className="font-bold uppercase">{proposalAction}</span> · {proposalActionHelp[proposalAction]}
        </div>
        <div className="grid grid-cols-1 gap-1">
          {governanceHelp.map((item) => (
            <div key={item.label} className={getHelpPillClass(isDark)}>
              <span className="font-bold uppercase">{item.label}</span> · {item.detail}
            </div>
          ))}
        </div>
      </div>
      <button
        data-testid="gov-create-proposal"
        disabled={busy['proposal-create']}
        onClick={createProposal}
        className={getActionButtonClass(isDark)}
      >
        {busy['proposal-create'] ? <Spinner /> : 'Create Proposal'}
      </button>
      {proposals.length === 0 && (
        <div className={clsx('text-[10px] font-mono opacity-60', isDark ? 'text-gray-500' : 'text-slate-500')}>
          No pending proposals.
        </div>
      )}
      {proposals.map((proposal: any) => {
        const id = String(proposal.id);
        const approveKey = `approve:${id}`;
        const executeKey = `execute:${id}`;
        const cancelKey = `cancel:${id}`;
        return (
          <div key={id} className={getRowCardClass(isDark)}>
            <div className="flex items-center justify-between gap-2">
              <div className={clsx('min-w-0 text-[10px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
                {proposal.action}
              </div>
              <span className={clsx('text-[9px] font-mono shrink-0', isDark ? 'text-gray-500' : 'text-slate-500')}>
                {proposal.status}
              </span>
            </div>
            <div className={clsx('mt-1 text-[9px] font-mono opacity-70 truncate', isDark ? 'text-gray-400' : 'text-slate-600')}>
              approvals {Array.isArray(proposal.approvals) ? proposal.approvals.length : 0}/{proposal.threshold || 1} · {proposal.reason || 'NO_REASON'}
            </div>
            {proposal.zkProof && (
                <div className={clsx('mt-1 text-[8px] font-mono opacity-50 truncate', isDark ? 'text-green-400' : 'text-green-600')} title={`ZK Proof: ${proposal.zkProof}`}>
                    [ZK-VERIFIED] {proposal.zkProof.substring(0, 16)}...
                </div>
            )}
            <div className="mt-2 flex items-center gap-1.5">
              <button
                data-testid={`gov-approve-${id}`}
                disabled={busy[approveKey]}
                onClick={() => runAction({
                  key: approveKey,
                  execute: () => atcApi.approveProposal(id),
                  errorLabel: 'PROPOSAL_APPROVE_FAILED',
                  requestMessage: `GOVERNANCE_APPROVAL_REQUESTED ${proposal.action}`,
                  successMessage: `GOVERNANCE_APPROVAL_RECORDED ${proposal.action}`,
                  successType: 'policy',
                  successStage: 'accepted',
                  domain: 'governance',
                  actionKey: proposal.action,
                }).catch(e => {
                    addLog(`Approve Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'governance', actionKey: proposal.action });
                })}
                className={getActionButtonClass(isDark, 'neutral')}
              >
                {busy[approveKey] ? <Spinner /> : 'Approve'}
              </button>
              <button
                data-testid={`gov-execute-${id}`}
                disabled={busy[executeKey] || proposal.status !== 'READY'}
                onClick={() => runAction({
                  key: executeKey,
                  execute: () => atcApi.executeProposal(id),
                  errorLabel: 'PROPOSAL_EXECUTE_FAILED',
                  requestMessage: `GOVERNANCE_EXECUTION_REQUESTED ${proposal.action}`,
                  successMessage: `GOVERNANCE_EXECUTED ${proposal.action}`,
                  successType: 'success',
                  successStage: 'executed',
                  domain: 'governance',
                  actionKey: proposal.action,
                }).catch(e => {
                    addLog(`Execute Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'governance', actionKey: proposal.action });
                })}
                className={getActionButtonClass(isDark, 'warn')}
              >
                {busy[executeKey] ? <Spinner /> : 'Execute'}
              </button>
              <button
                data-testid={`gov-cancel-${id}`}
                disabled={busy[cancelKey]}
                onClick={() => runAction({
                  key: cancelKey,
                  execute: () => atcApi.cancelProposal(id, governanceCancelReason || 'OPS_PANEL_CANCEL'),
                  errorLabel: 'PROPOSAL_CANCEL_FAILED',
                  requestMessage: `GOVERNANCE_CANCEL_REQUESTED ${proposal.action}`,
                  successMessage: `GOVERNANCE_CANCELLED ${proposal.action}`,
                  successType: 'warn',
                  successStage: 'executed',
                  domain: 'governance',
                  actionKey: proposal.action,
                }).catch(e => {
                    addLog(`Cancel Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'governance', actionKey: proposal.action });
                })}
                className={getActionButtonClass(isDark, 'critical')}
              >
                {busy[cancelKey] ? <Spinner /> : 'Cancel'}
              </button>
            </div>
          </div>
        );
      })}
      <div className={clsx('pt-1 text-[9px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
        Recent History
      </div>
      <div className="space-y-1.5">
        {proposalHistory.map((proposal: any) => (
          <div key={`history:${proposal.id}`} className={getRowCardClass(isDark)}>
            <div className="flex items-center justify-between gap-2">
              <div className={clsx('min-w-0 text-[10px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
                {proposal.action}
              </div>
              <span className={clsx('text-[9px] font-mono shrink-0', isDark ? 'text-gray-500' : 'text-slate-500')}>
                {proposal.status}
              </span>
            </div>
            <div className={clsx('mt-1 text-[9px] font-mono opacity-70 truncate', isDark ? 'text-gray-400' : 'text-slate-600')}>
              {proposal.reason || 'NO_REASON'} · {new Date(Number(proposal.createdAt || 0)).toLocaleTimeString()}
            </div>
            {proposal.zkProof && (
                <div className={clsx('mt-0.5 text-[8px] font-mono opacity-50 truncate', isDark ? 'text-green-400' : 'text-green-600')} title={`ZK Proof: ${proposal.zkProof}`}>
                    [ZK] {proposal.zkProof.substring(0, 12)}...
                </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
