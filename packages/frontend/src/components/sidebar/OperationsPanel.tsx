import React, { useState, useCallback } from 'react';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/store/ui';
import { GovernancePanel } from './operations/GovernancePanel';
import { IsolationPanel } from './operations/IsolationPanel';
import { SettlementPanel } from './operations/SettlementPanel';
import { BusyMap, RunActionArgs, ActionStatusMap } from './operations/opsUiHelpers';

export const OperationsPanel = () => {
  const { isDark     } = useUIStore(useShallow(s => ({ isDark: s.isDark })));
  const { playClick, playAlert  } = useATCStore(useShallow(s => ({ playClick: s.actions.playClick, playAlert: s.actions.playAlert })));
  // OperationsPanel no longer subscribes to useATCStore(state) to prevent rerenders
  const addLog = useATCStore(s => s.addLog);
  const [busy, setBusy] = useState<BusyMap>({});
  const [status, setStatus] = useState<ActionStatusMap>({});
  const [collapsed, setCollapsed] = useState<{ governance: boolean; isolation: boolean; settlement: boolean }>({ governance: false, isolation: false, settlement: false });

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
      setStatus((prev) => {
        const next = { ...prev };
        const ttlMs = 60_000;
        const now = Date.now();
        for (const k of Object.keys(next)) {
          if (now - Number(next[k]?.at || 0) > ttlMs) delete next[k];
        }
        return next;
      });
      if (requestMessage) {
        addLog(requestMessage, 'info', 'SYSTEM', { stage: 'request', domain, actionKey });
      }
      const result = await execute();

      const accepted = Boolean(result?.accepted ?? result?.scheduled ?? result?.proposalId);
      const autoExecuted = result?.autoExecuted === true;
      const executedOk = result?.executedOk ?? (result?.executed ? result.executed.success === true : null);
      const failed = result?.success === false || executedOk === false || String(result?.status || '') === 'FAILED';

      if (accepted) {
        if (!autoExecuted && result?.success !== false) {
          addLog(`⚡ PROPOSAL_ACCEPTED ${String(actionKey || key)}`, 'policy', 'SYSTEM', { stage: 'accepted', domain, actionKey });
          setStatus((prev) => ({ ...prev, [key]: { state: 'accepted', at: Date.now() } }));
          return result;
        }

        if (failed) {
          playAlert();
          addLog(
            `⚠️ PROPOSAL_EXECUTION_FAILED ${String(actionKey || key)}: ${String(result?.error || result?.executed?.error || 'EXECUTION_FAILED')}`,
            'error',
            'SYSTEM',
            { stage: 'failed', domain, actionKey },
          );
          setStatus((prev) => ({ ...prev, [key]: { state: 'failed', at: Date.now() } }));
          return result;
        }
      }

      if (result?.success === false || result?.ok === false) {
        throw new Error(String(result?.error || 'ACTION_FAILED'));
      }
      if (successMessage) {
        addLog(successMessage, successType, 'SYSTEM', { stage: successStage, domain, actionKey });
      }
      setStatus((prev) => ({ ...prev, [key]: { state: 'executed', at: Date.now() } }));
      return result;
    } catch (err: any) {
      playAlert();
      addLog(`${errorLabel}: ${err?.message || 'UNKNOWN'}`, 'error', 'SYSTEM', { stage: 'failed', domain, actionKey });
      setStatus((prev) => ({ ...prev, [key]: { state: 'failed', at: Date.now() } }));
      throw err;
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }, [addLog, playAlert, playClick]);

  return (
    <div data-testid="panel-ops" className="flex flex-col min-w-0">
      <div className="space-y-3">
        <GovernancePanel
          isDark={isDark}
          busy={busy}
          status={status}
          runAction={runAction}
          collapsed={collapsed.governance}
          onToggleCollapsed={() => setCollapsed((prev) => ({ ...prev, governance: !prev.governance }))}
        />
        <IsolationPanel
          isDark={isDark}
          busy={busy}
          status={status}
          runAction={runAction}
          collapsed={collapsed.isolation}
          onToggleCollapsed={() => setCollapsed((prev) => ({ ...prev, isolation: !prev.isolation }))}
        />
        <SettlementPanel
          isDark={isDark}
          busy={busy}
          status={status}
          runAction={runAction}
          collapsed={collapsed.settlement}
          onToggleCollapsed={() => setCollapsed((prev) => ({ ...prev, settlement: !prev.settlement }))}
        />
      </div>
    </div>
  );
};
