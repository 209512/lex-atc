import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SidebarContainer } from '@/components/layout/SidebarContainer';
import { createATCValue } from '@/test/renderWithProviders';
import { useATCStore } from '@/store/atc';

vi.mock('@/hooks/system/useSidebarResize', () => ({
  useSidebarResize: () => ({
    sidebarRef: { current: null },
    isResizing: false,
    handleMouseDown: vi.fn(),
  }),
}));

vi.mock('@/components/sidebar/SidebarHeader', () => ({
  SidebarHeader: () => <div>SidebarHeader</div>,
}));

vi.mock('@/components/sidebar/SidebarControlPanel', () => ({
  SidebarControlPanel: () => <div>SidebarControlPanel</div>,
}));

vi.mock('@/components/sidebar/SystemStats', () => ({
  SystemStats: () => <div>SystemStatsContent</div>,
}));

vi.mock('@/components/sidebar/L4StatusPanel', () => ({
  L4StatusPanel: () => <div>L4StatusContent</div>,
}));

vi.mock('@/components/sidebar/OperationsPanel', () => ({
  OperationsPanel: () => <div>OperationsContent</div>,
}));

vi.mock('@/components/sidebar/AgentList', () => ({
  AgentList: () => <div>AgentListContent</div>,
}));

vi.mock('@/components/sidebar/AgentSettings', () => ({
  AgentSettings: () => <div>AgentSettings</div>,
}));

vi.mock('@/components/sidebar/SidebarCompactRail', () => ({
  SidebarCompactRail: () => <div>CompactRail</div>,
}));

describe('SidebarContainer', () => {
  test('collapses sections, reorders sections, and switches to compact rail', () => {
    const atcValue = createATCValue();

    const Wrapper = () => {
      return (
            <SidebarContainer />
      );
    };

    useATCStore.setState(atcValue);

    render(<Wrapper />);

    expect(screen.getByText('SystemStatsContent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /System Overview 접기/i }));

    expect(screen.queryByText('SystemStatsContent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /L4 Monitoring 아래로 이동/i }));

    const headings = screen.getAllByText(/System Overview|L4 Monitoring|Operations|Agents/).map((node) => node.textContent);
    expect(headings.indexOf('Operations')).toBeLessThan(headings.indexOf('L4 Monitoring'));

    fireEvent.click(screen.getByRole('button', { name: /HUD rail로 축소/i }));

    expect(screen.getByText('CompactRail')).toBeInTheDocument();
  });
});
