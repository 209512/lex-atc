import React from 'react';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { LogDomain, LogStage } from '@/contexts/atcTypes';

export const getSectionCardClass = (isDark: boolean) => clsx(
  'p-2.5 space-y-2',
  isDark ? 'border-t border-white/5 first:border-0' : 'border-t border-slate-200 first:border-0'
);

export const getRowCardClass = (isDark: boolean) => clsx(
  'rounded-md border px-2 py-2',
  isDark ? 'border-white/5 bg-white/[0.02]' : 'border-slate-200 bg-white'
);

export const getActionButtonClass = (isDark: boolean, tone: 'neutral' | 'warn' | 'critical' = 'neutral') => clsx(
  'px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase border transition disabled:opacity-40 disabled:cursor-not-allowed tracking-wide',
  tone === 'neutral' && (isDark ? 'border-blue-500/30 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25' : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'),
  tone === 'warn' && (isDark ? 'border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'),
  tone === 'critical' && (isDark ? 'border-red-500/30 bg-red-500/15 text-red-200 hover:bg-red-500/25' : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100')
);

export const Spinner = () => <LoaderCircle size={12} className="animate-spin" />;

export const getInputClass = (isDark: boolean) => clsx(
  'w-full rounded border px-2.5 py-1.5 text-[11px] font-mono outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors',
  isDark ? 'border-white/20 bg-black/40 text-gray-100 placeholder:text-gray-400' : 'border-slate-300 bg-white text-slate-800 placeholder:text-slate-400'
);

export const getHelpPillClass = (isDark: boolean) => clsx(
  'rounded-md border px-2.5 py-2 text-[10px] leading-relaxed',
  isDark ? 'border-white/10 bg-white/[0.05] text-gray-300' : 'border-slate-200 bg-slate-50 text-slate-600'
);

export type BusyMap = Record<string, boolean>;

export type RunActionArgs = {
  key: string;
  execute: () => Promise<any>;
  errorLabel: string;
  requestMessage?: string;
  successMessage?: string;
  successType?: 'info' | 'warn' | 'success' | 'policy' | 'system' | 'critical';
  successStage?: LogStage;
  domain?: LogDomain;
  actionKey?: string;
};

export interface CommonPanelProps {
  isDark: boolean;
  busy: BusyMap;
  runAction: (args: RunActionArgs) => Promise<any>;
}
