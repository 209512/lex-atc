import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OperationsPanel } from '@/components/sidebar/OperationsPanel';
import { createATCValue, renderWithProviders } from '@/test/renderWithProviders';
import { useATCStore } from '@/store/atc';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    createProposal: vi.fn(async () => ({ success: true })),
    approveProposal: vi.fn(async () => ({ success: true })),
    executeProposal: vi.fn(async () => ({ success: true })),
    cancelProposal: vi.fn(async () => ({ success: true })),
    finalizeTask: vi.fn(async () => ({ success: true })),
    rollbackTask: vi.fn(async () => ({ success: true })),
    cancelTask: vi.fn(async () => ({ success: true })),
    openDispute: vi.fn(async () => ({ success: true })),
    slashSettlement: vi.fn(async () => ({ success: true })),
  }
}));

vi.mock('@/contexts/atcApi', () => ({
  atcApi: apiMock,
}));

describe('OperationsPanel', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach(mockFn => mockFn.mockClear());
    useATCStore.setState({ state: createATCValue().state });
  });

  test('sends advanced settlement parameters from inputs', async () => {
    const customState = {
      ...createATCValue().state,
      settlement: {
        channels: [{ channelId: 'channel:agent-1', lastNonce: 7, lastStateHash: 'hash', lastStatus: 'SUBMITTED', lastUpdatedAt: Date.now(), disputed: false }],
        pending: [],
      },
    };
    useATCStore.setState({ state: customState });

    renderWithProviders(<OperationsPanel />, {
      atcValue: createATCValue({ state: customState }),
    });

    fireEvent.change(screen.getByPlaceholderText('Actor ID'), { target: { value: 'executor-9' } });
    fireEvent.change(screen.getByPlaceholderText('Target Nonce'), { target: { value: '11' } });
    fireEvent.change(screen.getAllByPlaceholderText('Reason')[1], { target: { value: 'manual_review' } });

    fireEvent.click(screen.getByRole('button', { name: 'Dispute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Slash' }));

    await waitFor(() => {
      expect(apiMock.openDispute).toHaveBeenCalledWith('channel:agent-1', 'executor-9', 11, 'MANUAL_REVIEW');
      expect(apiMock.slashSettlement).toHaveBeenCalledWith('channel:agent-1', 'executor-9', 'MANUAL_REVIEW');
    });
  });

  test('creates governance proposals with advanced inputs', async () => {
    renderWithProviders(<OperationsPanel />, {
      atcValue: createATCValue(),
    });

    fireEvent.change(screen.getByDisplayValue('TRANSFER_LOCK'), { target: { value: 'SCALE_AGENTS' } });
    fireEvent.change(screen.getByPlaceholderText('Scale Count'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('Proposal Reason'), { target: { value: 'capacity_shift' } });
    fireEvent.change(screen.getByPlaceholderText('Approval Threshold'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('Timelock (ms)'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('Target ID (Optional)'), { target: { value: 'target-456' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Proposal' }));

    await waitFor(() => {
      expect(apiMock.createProposal).toHaveBeenCalledWith({
        action: 'SCALE_AGENTS',
        params: { count: 4 },
        timelockMs: 500,
        threshold: 2,
        reason: 'CAPACITY_SHIFT'
      });
    });
  });

  test('applies governance, isolation, and settlement scenario presets into form inputs', () => {
    renderWithProviders(<OperationsPanel />, {
      atcValue: createATCValue(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Capacity Surge/i }));
    expect(screen.getByDisplayValue('SCALE_AGENTS')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Proposal Reason')).toHaveValue('CAPACITY_SURGE');
    expect(screen.getByPlaceholderText('Scale Count')).toHaveValue('6');
    expect(screen.getByPlaceholderText('Approval Threshold')).toHaveValue('2');
    expect(screen.getByPlaceholderText('Timelock (ms)')).toHaveValue('250');

    fireEvent.click(screen.getByRole('button', { name: /Night Ops/i }));
    expect(screen.getByPlaceholderText('Proposal Reason')).toHaveValue('NIGHT_OPS');
    expect(screen.getByPlaceholderText('Approval Threshold')).toHaveValue('2');

    fireEvent.click(screen.getByRole('button', { name: /Rollback Safe/i }));
    expect(screen.getAllByPlaceholderText('Reason')[0]).toHaveValue('SAFE_ROLLBACK');

    fireEvent.click(screen.getByRole('button', { name: /Dispute Escalation/i }));
    expect(screen.getAllByPlaceholderText('Reason')[1]).toHaveValue('DISPUTE_ESCALATION');

    fireEvent.click(screen.getByRole('button', { name: /Operator Slash/i }));
    expect(screen.getByPlaceholderText('Actor ID')).toHaveValue('operator-1');
    expect(screen.getAllByPlaceholderText('Reason')[1]).toHaveValue('POLICY_BREACH');
  });
});
