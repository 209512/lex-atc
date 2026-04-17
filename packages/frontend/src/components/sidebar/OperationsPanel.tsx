import React, { useState, useCallback } from 'react';
import clsx from 'clsx';
import { ShieldAlert } from 'lucide-react';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/store/ui';
import { GovernancePanel } from './operations/GovernancePanel';
import { IsolationPanel } from './operations/IsolationPanel';
import { SettlementPanel } from './operations/SettlementPanel';
import { BusyMap, RunActionArgs } from './operations/opsUiHelpers';
import { useModalStore } from '@/store/ui/modalStore';

export const OperationsPanel = () => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const { playClick, playAlert  } = useATCStore(useShallow(s => ({ playClick: s.actions.playClick, playAlert: s.actions.playAlert })));
  // OperationsPanel no longer subscribes to useATCStore(state) to prevent rerenders
  const addLog = useATCStore(s => s.addLog);
  const [busy, setBusy] = useState<BusyMap>({});
  const { setPolicyModalOpen } = useModalStore();

  const runAction = useCallback(async ({
    key,
    execute,
    errorLabel,
    requestMessage,
    successMessage,
    successType = 'success',
    successStage = 'executed',
    domain = 'system',
    actionKey,
  }: RunActionArgs) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      playClick();
      if (requestMessage) {
        addLog(requestMessage, 'info', 'SYSTEM', { stage: 'request', domain, actionKey });
      }
      const result = await execute();
      if (result?.success === false || result?.ok === false) {
        throw new Error(String(result?.error || 'ACTION_FAILED'));
      }
      if (successMessage) {
        addLog(successMessage, successType, 'SYSTEM', { stage: successStage, domain, actionKey });
      }
      return result;
    } catch (err: any) {
      playAlert();
      addLog(`${errorLabel}: ${err?.message || 'UNKNOWN'}`, 'error', 'SYSTEM', { stage: 'failed', domain, actionKey });
      throw err;
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }, [addLog, playAlert, playClick]);

  return (
    <div data-testid="panel-ops" className="flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-blue-500" />
          <div className={clsx('text-[11px] font-mono font-bold uppercase tracking-[0.18em]', isDark ? 'text-gray-300' : 'text-slate-800')}>
            Ops Control
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPolicyModalOpen(true)}
          className={clsx(
            'px-2 py-1 rounded-md border text-[9px] font-mono uppercase tracking-[0.12em] transition',
            isDark ? 'border-blue-500/30 text-blue-200 hover:bg-blue-500/10' : 'border-blue-200 text-blue-700 hover:bg-blue-50'
          )}
        >
          Policy Templates
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <GovernancePanel isDark={isDark} busy={busy} runAction={runAction} />
        <IsolationPanel isDark={isDark} busy={busy} runAction={runAction} />
        <SettlementPanel isDark={isDark} busy={busy} runAction={runAction} />
      </div>
    </div>
  );
};
