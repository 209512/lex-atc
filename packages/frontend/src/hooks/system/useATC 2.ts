// src/hooks/system/useATC.ts
import { useATCStore } from '@/store/atc';

export const useATC = () => {
  return useATCStore();
};