import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useATCStore } from '@/store/atc';

export const createATCValue = (overrides: any = {}) => {
  return {
    state: {
      resourceId: 'TEST',
      holder: null,
      waitingAgents: [],
      priorityAgents: [],
      forcedCandidate: null,
      globalStop: false,
      collisionCount: 0,
      logs: [],
      activeAgentCount: 0,
      overrideSignal: false,
      latency: 0,
      timestamp: Date.now(),
      trafficIntensity: 0,
      governance: { proposals: [] },
      isolation: { tasks: [], summary: { waitingAdmin: 0, inProgress: 0, failed: 0 } },
      settlement: { channels: [], pending: [] },
      ...overrides.state,
    },
    agents: overrides.agents || [],
    actions: {
      playAlert: vi.fn(),
      playClick: vi.fn(),
      playSuccess: vi.fn(),
      ...overrides.actions,
    }
  };
};

export const renderWithProviders = (
  ui: React.ReactElement,
  {
    route = '/dashboard',
    atcValue = createATCValue(),
  }: {
    route?: string;
    atcValue?: any;
  } = {}
) => {
  if (atcValue) {
    useATCStore.setState(atcValue);
  }
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {ui}
    </MemoryRouter>
  );
};
