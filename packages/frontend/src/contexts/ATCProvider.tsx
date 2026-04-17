// src/contexts/ATCProvider.tsx
import React, { createContext } from 'react';
import { useATCStream } from '@/hooks/system/useATCStream'; 

export interface ATCContextType {}

export const ATCContext = createContext<ATCContextType | null>(null);

export const ATCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useATCStream();

  return (
    <ATCContext.Provider value={{}}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f655; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3b82f6aa; }
      `}</style>
      {children}
    </ATCContext.Provider>
  );
};
