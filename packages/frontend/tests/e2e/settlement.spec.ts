import { test, expect } from '@playwright/test';
import { waitForAppMounted, waitForMswReady } from './e2eUtils';

test.describe('Settlement dispute/slash flow', () => {
  test.beforeEach(async ({ page }) => {
    const mswUnhandled: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[MSW]') &&
        text.toLowerCase().includes('captured a request without a matching request handler')
      ) {
        mswUnhandled.push(text);
      }
    });

    page.on('pageerror', (err) => {
      mswUnhandled.push(`PAGEERROR: ${err.message}`);
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('lex-atc-tour-seen', 'true');
      window.localStorage.setItem(
        'lex-atc.ui-state.v3',
        JSON.stringify({
          state: {
            sidebarWidth: 450,
            viewMode: 'detached',
            areTooltipsEnabled: true,
            uiPreferences: {
              theme: 'dark',
              viewMode: 'operator',
              panels: {
                terminal: { isOpen: true },
                queue: { isOpen: true },
                tactical: { isOpen: true },
                l4: { isOpen: true },
              },
              panelOrder: [],
              sidebar: {
                sections: { ops: true, overview: false, l4: false, agents: false },
                sectionOrder: ['ops'],
              },
              terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' },
              l4: { rightPanel: 'summary' },
            },
          },
          version: 0,
        }),
      );
    });

    await page.goto('/');
    await waitForAppMounted(page);
    await waitForMswReady(page);

    await expect(page.getByTestId('ops-settlement')).toBeVisible({ timeout: 15000 });
    expect(mswUnhandled).toEqual([]);
  });

  test('opens dispute then slashes and UI reflects status', async ({ page }) => {
    const channelId = 'chan-777';

    await page.getByTestId('settle-channel-id').fill(channelId);
    await page.getByTestId('settle-dispute-manual').click();
    await expect(page.getByTestId('settle-dispute-manual').getByTestId(/ops-status-(accepted|executed)/)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('settle-slash-manual').click();
    await expect(page.getByTestId('settle-slash-manual').getByTestId(/ops-status-(accepted|executed)/)).toBeVisible({ timeout: 15000 });
  });
});
