// src/utils/audioService.ts
class AudioService {
  private ctx: AudioContext | null = null;
  private lastPlayTime: number = 0;
  private readonly MIN_INTERVAL = 0.05;
  private isActivated: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const initAudio = () => {
        const context = this.getContext();
        if (context.state === 'suspended') {
          context.resume().then(() => {
            this.isActivated = true;
            window.removeEventListener('click', initAudio);
          });
        } else {
          this.isActivated = true;
          window.removeEventListener('click', initAudio);
        }
      };
      window.addEventListener('click', initAudio);
    }
  }

  private getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  play(frequency: number, type: OscillatorType, duration: number, volume: number) {
    if (!this.isActivated) return;

    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      if (now - this.lastPlayTime < this.MIN_INTERVAL) return;
      this.lastPlayTime = now;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (_e) {
      // ignore
    }
  }
}

export const audioService = new AudioService();