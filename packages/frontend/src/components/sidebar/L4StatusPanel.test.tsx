import React from 'react';
import { screen } from '@testing-library/react';
import { L4StatusPanel } from '@/components/sidebar/L4StatusPanel';
import { createATCValue, renderWithProviders } from '@/test/renderWithProviders';

describe('L4StatusPanel', () => {
  test('renders watchlist section', () => {
    renderWithProviders(
      <L4StatusPanel />,
      {
        route: '/dashboard',
        atcValue: createATCValue(),
      }
    );

    expect(screen.getByText(/watchlist/i)).toBeInTheDocument();
  });
});
