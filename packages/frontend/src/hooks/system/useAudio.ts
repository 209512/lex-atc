// src/hooks/system/useAudio.ts
import { useCallback } from 'react';
import { audioService } from '@/utils/audioService';

export const useAudio = (isAdminMuted: boolean) => {
  const playClick = useCallback(() => {
    if (isAdminMuted) return;
    audioService.play(1200, 'sine', 0.03, 0.02); 
  }, [isAdminMuted]);

  const playSuccess = useCallback(() => {
    if (isAdminMuted) return;
    // 이중 톤 재생
    audioService.play(440, 'sine', 0.1, 0.04);
    setTimeout(() => {
      audioService.play(880, 'sine', 0.1, 0.03);
    }, 60);
  }, [isAdminMuted]);

  const playWarning = useCallback(() => {
    if (isAdminMuted) return;
    audioService.play(110, 'square', 0.2, 0.02);
  }, [isAdminMuted]);

  const playAlert = useCallback(() => {
    if (isAdminMuted) return;
    audioService.play(220, 'sawtooth', 0.2, 0.02);
    setTimeout(() => {
      audioService.play(180, 'sawtooth', 0.2, 0.02);
    }, 150);
  }, [isAdminMuted]);

  return { playClick, playSuccess, playWarning, playAlert };
};