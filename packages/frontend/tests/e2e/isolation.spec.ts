import { test, expect } from '@playwright/test';

test.describe('Isolation Operations Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('lex-atc-tour-seen', 'true');
      window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', areTooltipsEnabled: true, uiPreferences: { sidebar: { sections: { ops: true, overview: false, l4: false, agents: false }, sectionOrder: ['ops'] }, panels: { terminal: { isOpen: true }, queue: { isOpen: true }, tactical: { isOpen: true }, l4: { isOpen: true } }, panelOrder: [], theme: 'dark', viewMode: 'operator', terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
    });

    const mswReady = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('Mocking enabled.'),
      timeout: 15000,
    });
    await page.goto('/');
    await mswReady.catch(() => {});

    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('finalizes a pending isolation task', async ({ page }) => {
    const iso = page.getByTestId('ops-isolation');
    await expect(iso).toBeVisible({ timeout: 15000 });
    await expect(iso.getByText('ADMIN_REVIEW')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('iso-finalize-task-001').click();
    await expect(iso.getByText('FINALIZED')).toBeVisible({ timeout: 15000 });
  });

  test('rolls back a pending isolation task', async ({ page }) => {
    const iso = page.getByTestId('ops-isolation');
    await expect(iso).toBeVisible({ timeout: 15000 });

    await page.getByTestId('iso-rollback-task-001').click();
    await expect(page.getByTestId('iso-rollback-task-001')).toHaveCount(0);
  });
});
