import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TerminalLog } from '@/components/monitoring/terminal/TerminalLog';
import { createATCValue } from '@/test/renderWithProviders';
import { useATCStore } from '@/store/atc';

vi.mock('react-draggable', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('TerminalLog', () => {
  test('shows lifecycle stage tags and supports domain and action filters', () => {
    const baseATC = createATCValue();
    const atcValue = createATCValue({
      agents: [],
      isAdminMuted: false,
      state: {
        ...baseATC.state,
        logs: [
          { id: '1', agentId: 'SYSTEM', message: '🚨 EMERGENCY OVERRIDE REQUESTED', timestamp: Date.now(), type: 'critical', stage: 'request', domain: 'system', actionKey: 'OVERRIDE' },
          { id: '2', agentId: 'SYSTEM', message: '🛑 GLOBAL STOP REQUESTED', timestamp: Date.now() + 1, type: 'system', stage: 'accepted', domain: 'system', actionKey: 'TOGGLE_STOP' },
          { id: '3', agentId: 'SYSTEM', message: '⚡ LOCK TRANSFER STARTED', timestamp: Date.now() + 2, type: 'policy', stage: 'accepted', domain: 'lock', actionKey: 'TRANSFER_LOCK' },
        ],
      },
    });

    useATCStore.setState({ state: atcValue.state });

    const Wrapper = () => {
      return (
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <TerminalLog />
        </MemoryRouter>
      );
    };

    render(<Wrapper />);

    expect(screen.getByText(/EMERGENCY OVERRIDE REQUESTED/i)).toBeInTheDocument();
    expect(screen.getByText(/GLOBAL STOP REQUESTED/i)).toBeInTheDocument();
    expect(screen.getByText('[REQ]')).toBeInTheDocument();
    expect(screen.getAllByText('[ACK]')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Terminal domain filter lock' }));

    expect(screen.queryByText(/GLOBAL STOP REQUESTED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/LOCK TRANSFER STARTED/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Terminal domain filter ALL' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Terminal action filter' }), { target: { value: 'OVERRIDE' } });

    expect(screen.queryByText(/LOCK TRANSFER STARTED/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GLOBAL STOP REQUESTED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/EMERGENCY OVERRIDE REQUESTED/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Terminal action filter' }), { target: { value: 'ALL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminal type filter system' }));

    expect(screen.getByText(/GLOBAL STOP REQUESTED/i)).toBeInTheDocument();
  });
});
