import React from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  subtitle?: string;
  isDark: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disableMoveUp?: boolean;
  disableMoveDown?: boolean;
  children: React.ReactNode;
}

export const SidebarSection = ({ title, subtitle, isDark, isOpen, onToggle, onMoveUp, onMoveDown, disableMoveUp = false, disableMoveDown = false, children }: SidebarSectionProps) => (
  <section className={clsx('rounded-xl border overflow-hidden', isDark ? 'border-gray-800 bg-[#0d1117]/70' : 'border-slate-200/70 bg-white/80')}>
    <div className={clsx('w-full flex items-center justify-between gap-3 px-3 py-2.5 border-b text-left', isDark ? 'border-white/5' : 'border-slate-200/70')}>
      <button onClick={onToggle} className={clsx('min-w-0 flex-1 text-left rounded transition px-1 py-0.5 -mx-1 -my-0.5', isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50')}>
        <div className={clsx('text-[10px] font-mono font-bold uppercase tracking-[0.16em]', isDark ? 'text-gray-200' : 'text-slate-900')}>
          {title}
        </div>
        {subtitle && (
          <div className={clsx('mt-0.5 text-[9px] font-mono truncate', isDark ? 'text-gray-500' : 'text-slate-500')}>
            {subtitle}
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={disableMoveUp}
          onClick={onMoveUp}
          aria-label={`${title} 위로 이동`}
          className={clsx('p-1 rounded transition disabled:opacity-30', isDark ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-slate-100 text-slate-500')}
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          disabled={disableMoveDown}
          onClick={onMoveDown}
          aria-label={`${title} 아래로 이동`}
          className={clsx('p-1 rounded transition disabled:opacity-30', isDark ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-slate-100 text-slate-500')}
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? `${title} 접기` : `${title} 펼치기`}
          className={clsx('p-1 rounded transition', isDark ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-slate-100 text-slate-500')}
        >
          <ChevronDown size={14} className={clsx('shrink-0 transition-transform', isOpen && 'rotate-180')} />
        </button>
      </div>
    </div>
    {isOpen && <div className="p-3">{children}</div>}
  </section>
);
