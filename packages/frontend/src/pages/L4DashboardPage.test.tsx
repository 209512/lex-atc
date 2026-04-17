import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { L4DashboardPage } from '@/pages/L4DashboardPage';
import { createATCValue } from '@/test/renderWithProviders';
import { useATCStore } from '@/store/atc';

describe('L4DashboardPage', () => {
  test('renders compact overlay and toggles legend guide', () => {
    const atcValue = createATCValue({
        state: {
          ...createATCValue().state,
          contractVersion: 3,
          sse: { serverTime: Date.now() },
          isolation: {
            tasks: [
              { taskId: 'task-1', status: 'PENDING', classification: 'compute', actorUuid: 'agent-1', createdAt: Date.now() },
            ],
            summary: { waitingAdmin: 1, inProgress: 1, failed: 0 },
          },
          governance: {
            proposals: [
              { id: 'proposal-1', action: 'TRANSFER_LOCK', status: 'READY', approvals: [], threshold: 1, createdAt: Date.now() },
            ],
          },
          settlement: {
            channels: [
              { channelId: 'channel-1', lastNonce: 1, lastStateHash: 'hash', lastStatus: 'OPEN', lastUpdatedAt: Date.now(), disputed: false },
            ],
            pending: [],
          },
        },
      });

    const Wrapper = () => {
      return (
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <L4DashboardPage />
          </MemoryRouter>
      );
    };

    useATCStore.setState(atcValue);

    render(<Wrapper />);

    expect(screen.getByText('L4 Monitor')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'L4 legend dock' }));

    expect(screen.getByText('Status Legend')).toBeInTheDocument();
  });
});
