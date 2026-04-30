import { test, expect } from '@playwright/test';

test.describe('Backend mode governance failure UX', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('shows FAILED badge for settlement dispute auto-execution failure', async ({ page }) => {
    await page.route('**/api/settlement/disputes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          accepted: true,
          scheduled: true,
          proposalId: 'p-test-1',
          status: 'FAILED',
          autoExecuted: true,
          executed: { success: false, error: 'SOLANA_SETTLEMENT_DISABLED' },
          executedOk: false,
          error: 'SOLANA_SETTLEMENT_DISABLED',
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('deployment-mode-badge')).toContainText(/backend/i);
    await expect(page.getByTestId('ops-settlement')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('settle-channel-id').fill('channel:agent-1');
    await page.getByTestId('settle-dispute-manual').click();

    await expect(
      page.getByTestId('settle-dispute-manual').getByTestId('ops-status-failed'),
    ).toBeVisible({ timeout: 15000 });
  });
});
