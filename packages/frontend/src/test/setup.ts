import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock AudioContext for tests
class AudioContextMock {
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
  get currentTime() { return 0; }
  get destination() { return {}; }
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: AudioContextMock
});
Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: AudioContextMock
});

global.URL.createObjectURL = vi.fn(() => 'blob:test');
global.URL.revokeObjectURL = vi.fn();

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Make sure jsdom uses our mock for local storage
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

import { useATCStore, setupStoreActions } from '@/store/atc';
import { useUIStore } from '@/store/ui';

setupStoreActions();

// Zustand stores reset before each test
const initialATCState = useATCStore.getState();
const initialUIState = useUIStore.getState();

// Mock Zustand persist middleware specifically
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  return {
    ...actual,
    persist: (config: any) => config,
  };
});

beforeEach(() => {
  useATCStore.setState(initialATCState, true);
  useUIStore.setState(initialUIState, true);
  vi.clearAllMocks();
});

