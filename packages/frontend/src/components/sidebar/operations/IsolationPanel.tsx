import React, { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { Hammer } from 'lucide-react';
import { useATCStore } from '@/store/atc';
import { useShallow } from 'zustand/react/shallow';
import { atcApi } from '@/contexts/atcApi';
import { formatId } from '@/utils/agentIdentity';
import { isolationHelp, isolationPresets } from '@/components/sidebar/opsConsoleConfig';
import { getSectionCardClass, getRowCardClass, getActionButtonClass, Spinner, getInputClass, getHelpPillClass, CommonPanelProps } from './opsUiHelpers';

export const IsolationPanel: React.FC<CommonPanelProps> = ({ isDark, busy, runAction }) => {
  const state = useATCStore(useShallow(s => s.state));
  const addLog = useATCStore(s => s.addLog);
  const [taskAdminId, setTaskAdminId] = useState('');
  const [taskReason, setTaskReason] = useState('OPS_PANEL_REVIEW');
  const emergencyKey = 'emergency-stop';

  const tasks = useMemo(
    () => ((state.isolation?.tasks || []) as any[])
      .filter((task) => ['PENDING', 'FINALIZED', 'TIMED_OUT'].includes(String(task.status || '')))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 5),
    [state.isolation?.tasks]
  );

  const applyIsolationPreset = useCallback((preset: typeof isolationPresets[number]) => {
    setTaskAdminId(preset.values.adminUuid);
    setTaskReason(preset.values.reason);
  }, []);

  return (
    <section data-testid="ops-isolation" className={getSectionCardClass(isDark)}>
      <div className="flex items-center justify-between">
        <div className={clsx('flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.12em]', isDark ? 'text-blue-200' : 'text-blue-800')}>
          <Hammer size={11} />
          Isolation
        </div>
        <span className={clsx('text-[9px] font-mono', isDark ? 'text-gray-500' : 'text-slate-500')}>
          {tasks.length} actionable
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          disabled={busy[emergencyKey] || state.globalStop}
          onClick={() => runAction({
            key: emergencyKey,
            execute: () => atcApi.toggleGlobalStop(true),
            errorLabel: 'GLOBAL_STOP_FAILED',
            requestMessage: 'EMERGENCY_STOP_REQUESTED',
            successMessage: 'EMERGENCY_STOP_ENABLED',
            successType: 'warn',
            successStage: 'executed',
            domain: 'system',
            actionKey: 'TOGGLE_STOP',
          }).catch(e => {
            console.error('Emergency Stop Failed', e);
            addLog(`Emergency Stop Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'system', actionKey: 'TOGGLE_STOP' });
          })}
          className={getActionButtonClass(isDark, 'critical')}
        >
          {busy[emergencyKey] ? <Spinner /> : (state.globalStop ? 'Emergency Stop Active' : 'Emergency Stop')}
        </button>
        <button
          disabled={busy[`${emergencyKey}:resume`] || !state.globalStop}
          onClick={() => runAction({
            key: `${emergencyKey}:resume`,
            execute: () => atcApi.toggleGlobalStop(false),
            errorLabel: 'GLOBAL_RESUME_FAILED',
            requestMessage: 'GLOBAL_RESUME_REQUESTED',
            successMessage: 'GLOBAL_RESUMED',
            successType: 'success',
            successStage: 'executed',
            domain: 'system',
            actionKey: 'TOGGLE_STOP',
          }).catch(e => {
            console.error('Resume Failed', e);
            addLog(`Resume Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'system', actionKey: 'TOGGLE_STOP' });
          })}
          className={getActionButtonClass(isDark, 'neutral')}
        >
          {busy[`${emergencyKey}:resume`] ? <Spinner /> : 'Resume'}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <div className={clsx('text-[9px] font-mono uppercase tracking-[0.12em] opacity-70', isDark ? 'text-gray-500' : 'text-slate-500')}>
          Presets
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {isolationPresets.map((preset) => (
            <button key={preset.label} onClick={() => applyIsolationPreset(preset)} className={getHelpPillClass(isDark)}>
              <span className="font-bold">{preset.label}</span> · {preset.description}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1">
          {isolationHelp.map((item) => (
            <div key={item.label} className={getHelpPillClass(isDark)}>
              <span className="font-bold uppercase">{item.label}</span> · {item.detail}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={taskAdminId}
          onChange={(e) => setTaskAdminId(e.target.value)}
          placeholder="Admin ID (Optional)"
          className={getInputClass(isDark)}
        />
        <input
          value={taskReason}
          onChange={(e) => setTaskReason(e.target.value.toUpperCase())}
          placeholder="Reason"
          className={getInputClass(isDark)}
        />
      </div>
      {tasks.length === 0 && (
        <div className={clsx('text-[10px] font-mono opacity-60', isDark ? 'text-gray-500' : 'text-slate-500')}>
          No actionable tasks.
        </div>
      )}
      {tasks.map((task: any) => {
        const taskId = String(task.taskId);
        const finalizeKey = `finalize:${taskId}`;
        const rollbackKey = `rollback:${taskId}`;
        const cancelKey = `task-cancel:${taskId}`;
        const taskLabel = String(task.classification || task.kind || task.type || task.action || 'TASK').toUpperCase();
        return (
          <div key={taskId} className={getRowCardClass(isDark)}>
            <div className="flex items-center justify-between gap-2">
              <div className={clsx('min-w-0 text-[10px] font-mono font-bold truncate', isDark ? 'text-gray-200' : 'text-slate-900')}>
                {taskLabel}
              </div>
              <span className={clsx('text-[9px] font-mono shrink-0', isDark ? 'text-gray-500' : 'text-slate-500')}>
                {task.status}
              </span>
            </div>
            <div className={clsx('mt-1 text-[9px] font-mono opacity-70 truncate', isDark ? 'text-gray-400' : 'text-slate-600')}>
              id {formatId(taskId)} · {task.actorUuid ? formatId(task.actorUuid) : 'n/a'}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                data-testid={`iso-finalize-${taskId}`}
                disabled={busy[finalizeKey] || task.status !== 'PENDING'}
                onClick={() => runAction({
                  key: finalizeKey,
                  execute: () => atcApi.finalizeTask(taskId, taskAdminId || undefined),
                  errorLabel: 'TASK_FINALIZE_FAILED',
                  requestMessage: `ISOLATION_FINALIZE_REQUESTED ${taskId}`,
                  successMessage: `ISOLATION_FINALIZED ${taskId}`,
                  successType: 'success',
                  successStage: 'executed',
                  domain: 'isolation',
                  actionKey: 'TASK_FINALIZE',
                }).catch(e => {
                    console.error('Finalize Action Failed', e);
                    addLog(`Finalize Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'isolation', actionKey: 'TASK_FINALIZE' });
                })}
                className={getActionButtonClass(isDark, 'neutral')}
              >
                {busy[finalizeKey] ? <Spinner /> : 'Finalize'}
              </button>
              <button
                data-testid={`iso-rollback-${taskId}`}
                disabled={busy[rollbackKey] || !['PENDING', 'FINALIZED'].includes(String(task.status))}
                onClick={() => runAction({
                  key: rollbackKey,
                  execute: () => atcApi.rollbackTask(taskId, taskAdminId || undefined, taskReason || 'OPS_PANEL_ROLLBACK'),
                  errorLabel: 'TASK_ROLLBACK_FAILED',
                  requestMessage: `ISOLATION_ROLLBACK_REQUESTED ${taskId}`,
                  successMessage: `ISOLATION_ROLLED_BACK ${taskId}`,
                  successType: 'warn',
                  successStage: 'executed',
                  domain: 'isolation',
                  actionKey: 'TASK_ROLLBACK',
                }).catch(e => {
                    console.error('Rollback Action Failed', e);
                    addLog(`Rollback Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'isolation', actionKey: 'TASK_ROLLBACK' });
                })}
                className={getActionButtonClass(isDark, 'warn')}
              >
                {busy[rollbackKey] ? <Spinner /> : 'Rollback'}
              </button>
              <button
                data-testid={`iso-cancel-${taskId}`}
                disabled={busy[cancelKey] || !['PENDING', 'FINALIZED'].includes(String(task.status))}
                onClick={() => runAction({
                  key: cancelKey,
                  execute: () => atcApi.cancelTask(taskId, taskAdminId || undefined, taskReason || 'OPS_PANEL_CANCEL'),
                  errorLabel: 'TASK_CANCEL_FAILED',
                  requestMessage: `ISOLATION_CANCEL_REQUESTED ${taskId}`,
                  successMessage: `ISOLATION_CANCELLED ${taskId}`,
                  successType: 'warn',
                  successStage: 'executed',
                  domain: 'isolation',
                  actionKey: 'TASK_CANCEL',
                }).catch(e => {
                    console.error('Cancel Action Failed', e);
                    addLog(`Cancel Action Failed: ${e.message}`, 'error', 'SYSTEM', { stage: 'failed', domain: 'isolation', actionKey: 'TASK_CANCEL' });
                })}
                className={getActionButtonClass(isDark, 'critical')}
              >
                {busy[cancelKey] ? <Spinner /> : 'Cancel'}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
};
