import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { L4Legend } from '@/components/l4/L4Legend';

export const L4StatusSystemPage = () => {
  const { isDark, sidebarWidth     } = useUIStore(useShallow(s => ({ isDark: s.isDark, sidebarWidth: s.sidebarWidth })));

  return (
    <div className="absolute inset-y-4 left-4 z-40 pointer-events-none" style={{ width: `min(520px, calc(100vw - ${sidebarWidth}px - 32px))` }}>
      <div className={clsx('h-full rounded-2xl border p-5 overflow-auto custom-scrollbar pointer-events-auto shadow-2xl backdrop-blur-md', isDark ? 'bg-[#050505]/92 border-gray-800' : 'bg-white/92 border-slate-200')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/dashboard" className={clsx('inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em]', isDark ? 'text-blue-200 hover:text-blue-100' : 'text-blue-700 hover:text-blue-600')}>
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <div className={clsx('mt-4 text-[22px] font-black tracking-tight', isDark ? 'text-white/80' : 'text-slate-900')}>
              Status System
            </div>
            <div className={clsx('mt-1 text-[12px] font-mono opacity-70 max-w-[420px]', isDark ? 'text-gray-400' : 'text-slate-600')}>
              {/* 상태 코드와 의미, 계약 위반을 UI에서 즉시 식별한다. */}
            </div>
          </div>
          <Link to="/dashboard" className={clsx('p-2 rounded-lg border shrink-0', isDark ? 'border-white/10 text-gray-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>
            <X size={16} />
          </Link>
        </div>

        <div className="mt-6">
          <L4Legend />
        </div>
      </div>
    </div>
  );
};
