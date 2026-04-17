import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { L4StatusPanel } from '@/components/sidebar/L4StatusPanel';
import { createATCValue, renderWithProviders } from '@/test/renderWithProviders';

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

describe('L4StatusPanel', () => {
  test('navigates to status-system when contract button is clicked', () => {
    renderWithProviders(
      <>
        <L4StatusPanel />
        <LocationProbe />
      </>,
      {
        route: '/dashboard',
        atcValue: createATCValue(),
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /guide/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/status-system');
  });
});
