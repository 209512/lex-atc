import { test, expect } from '@playwright/test';

test.describe('Governance Operations Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('lex-atc-tour-seen', 'true');
      window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', uiPreferences: { theme: 'dark', viewMode: 'operator', panels: { terminal: { isOpen: true }, queue: { isOpen: true }, tactical: { isOpen: true }, l4: { isOpen: true } }, panelOrder: [], sidebar: { sections: { ops: true, overview: true, l4: true, agents: true }, sectionOrder: ['overview', 'l4', 'ops', 'agents'] }, terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
    });

    const mswReady = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('Mocking enabled.'),
      timeout: 15000,
    });
    await page.goto('/');
    await mswReady.catch(() => {});
    await expect(page).toHaveTitle(/frontend/i, { timeout: 30000 });
  });

  test('approve -> execute updates MSW state and UI', async ({ page }) => {
    const gov = page.getByTestId('ops-governance');
    await expect(gov).toBeVisible({ timeout: 15000 });

    await page.getByTestId('gov-preset-emergency-halt').click();
    await page.getByTestId('gov-create-proposal').click();

    const approveButton = gov.getByRole('button', { name: 'Approve' }).first();
    const executeButton = gov.getByRole('button', { name: 'Execute' }).first();
    await expect(approveButton).toBeVisible({ timeout: 15000 });
    await expect(executeButton).toBeDisabled({ timeout: 15000 });

    await approveButton.click();
    await expect(executeButton).toBeEnabled({ timeout: 15000 });

    await executeButton.click();
    await expect(gov.getByText('EXECUTED')).toBeVisible({ timeout: 15000 });
  });

  test('cancel updates MSW state and UI', async ({ page }) => {
    const gov = page.getByTestId('ops-governance');
    await expect(gov).toBeVisible({ timeout: 15000 });

    await page.getByTestId('gov-preset-emergency-halt').click();
    await page.getByTestId('gov-create-proposal').click();

    const cancelButton = gov.getByRole('button', { name: 'Cancel' }).first();
    await expect(cancelButton).toBeVisible({ timeout: 15000 });
    await cancelButton.click();
    await expect(gov.getByText('CANCELLED')).toBeVisible({ timeout: 15000 });
  });
});
