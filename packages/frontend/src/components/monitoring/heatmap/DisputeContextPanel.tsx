import React from 'react';
import clsx from 'clsx';
import { Gavel, X } from 'lucide-react';

interface DisputeContextPanelProps {
  channelId: string;
  actorUuid?: string;
  openedBy?: string;
  targetNonce?: number;
  reason?: string;
  isDark?: boolean;
  isVisible: boolean;
  onClose?: () => void;
}

export const DisputeContextPanel: React.FC<DisputeContextPanelProps> = ({
  channelId,
  actorUuid,
  openedBy,
  targetNonce,
  reason,
  isDark = true,
  isVisible,
  onClose,
}) => {
  if (!isVisible) return null;

  return (
    <div
      className={clsx(
        'w-80 rounded-lg p-4 shadow-2xl backdrop-blur-md border',
        isDark ? 'bg-slate-900/95 border-amber-500/30' : 'bg-white/95 border-amber-400/40'
      )}
    >
      <div className={clsx('flex items-center gap-2 mb-3 pb-2 border-b', isDark ? 'border-slate-700' : 'border-slate-200')}>
        <Gavel className={clsx('w-5 h-5', isDark ? 'text-amber-400' : 'text-amber-600')} />
        <h3 className={clsx('font-mono text-sm font-bold flex-1', isDark ? 'text-slate-200' : 'text-slate-900')}>
          DISPUTE CONTEXT
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={clsx(isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-3 font-mono text-xs">
        <div className="flex justify-between items-center">
          <span className={clsx(isDark ? 'text-slate-400' : 'text-slate-500')}>Channel:</span>
          <span className={clsx('truncate max-w-[12rem]', isDark ? 'text-amber-300' : 'text-amber-700')}>{channelId}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className={clsx(isDark ? 'text-slate-400' : 'text-slate-500')}>Actor:</span>
          <span className={clsx('truncate max-w-[12rem]', isDark ? 'text-slate-200' : 'text-slate-900')}>
            {actorUuid || 'UNKNOWN'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className={clsx(isDark ? 'text-slate-400' : 'text-slate-500')}>Opened By:</span>
          <span className={clsx('truncate max-w-[12rem]', isDark ? 'text-slate-200' : 'text-slate-900')}>
            {openedBy || 'UNKNOWN'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className={clsx(isDark ? 'text-slate-400' : 'text-slate-500')}>Target Nonce:</span>
          <span className={clsx(isDark ? 'text-slate-200' : 'text-slate-900')}>
            {Number.isFinite(targetNonce as number) ? targetNonce : 0}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className={clsx(isDark ? 'text-slate-400' : 'text-slate-500')}>Reason:</span>
          <span className={clsx('truncate max-w-[12rem]', isDark ? 'text-slate-200' : 'text-slate-900')}>
            {(reason || 'DISPUTE').toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};

