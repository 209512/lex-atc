// src/App.tsx
import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import clsx from 'clsx';
import { Outlet } from 'react-router-dom';
import { useUIStore } from '@/store/ui';
import { SidebarContainer } from '@/components/layout/SidebarContainer';

const App = () => {
  const { isDark, uiPreferences } = useUIStore(useShallow(s => ({ isDark: s.isDark, uiPreferences: s.uiPreferences })));

  React.useEffect(() => {
    if (uiPreferences.theme === 'high-contrast') {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }

    if (uiPreferences.reduceMotion) {
      document.body.classList.add('reduce-motion');
    } else {
      document.body.classList.remove('reduce-motion');
    }
  }, [uiPreferences.theme, uiPreferences.reduceMotion]);

  return (
    <div className={clsx(
      "h-screen w-screen font-sans flex flex-col md:flex-row overflow-hidden relative select-none", 
      isDark ? "bg-[#05090a] text-gray-300" : "bg-[#f1f5f9] text-slate-800",
      uiPreferences.fontSizeMode === 'large' ? 'text-lg' : uiPreferences.fontSizeMode === 'small' ? 'text-sm' : 'text-base'
    )}>
      <div className="flex-1 min-w-0 min-h-0 h-full relative overflow-hidden">
        <Outlet />
      </div>
      
      {/* 사이드바는 HUD보다 낮은 순위 혹은 동일 순위로 설정 (z-50) */}
      <div className="tour-step-sidebar h-full flex flex-col relative z-50">
        <SidebarContainer />
      </div>
    </div>
  );
};

export default App;
