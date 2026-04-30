import { test, expect } from '@playwright/test';

test('standalone deployment works without backend', async ({ page }) => {
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
              sections: { ops: true, overview: true, l4: true, agents: true },
              sectionOrder: ['overview', 'l4', 'ops', 'agents'],
            },
            terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' },
            l4: { rightPanel: 'summary' },
          },
        },
        version: 0,
      }),
    );
  });

  const mswReady = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('Mocking enabled.'),
    timeout: 15000,
  });

  await page.goto('/');
  await mswReady.catch(() => {});

  const sw = await page.request.get('/mockServiceWorker.js');
  expect(sw.ok()).toBeTruthy();
  expect(await sw.text()).toContain('Mock Service Worker');

  await expect(page.getByTestId('agent-AGT-001')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });

  await page.getByTestId('btn-system-settings').click();
  await expect(page.getByText('SYSTEM_CONFIG')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('select-riskvector-display-mode').selectOption('compact');
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(10, 10);

  const displayMode = await page.evaluate(() => {
    const raw = window.localStorage.getItem('lex-atc.ui-state.v3');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.uiPreferences?.riskVector?.displayMode ?? null;
  });
  expect(displayMode).toBe('compact');

  await page.getByTestId('agent-AGT-001').click();
  await expect(page.getByTestId('risk-vector-bars')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('risk-axis-T')).toBeVisible({ timeout: 15000 });

  await expect(page.getByText('3/10')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('에이전트 증가').click();
  await expect(page.getByText('4/10')).toBeVisible({ timeout: 15000 });

  await page.evaluate(async () => {
    await fetch('/api/settlement/slash', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'chan-777' }),
    });
  });

  await expect(page.getByTestId('ops-settlement')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('settle-dispute-chan-777')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('settle-slash-chan-777')).toBeVisible({ timeout: 15000 });

  const settlement = page.getByTestId('ops-settlement');
  await settlement.getByPlaceholder('Actor ID').fill('AGT-001');
  await settlement.getByPlaceholder('Target Nonce').fill('10');
  await settlement.getByPlaceholder('Reason').fill('E2E');

  await page.getByTestId('settle-dispute-chan-777').click();
  await expect(settlement.locator('text=DISPUTED').first()).toBeVisible({ timeout: 15000 });

  await page.getByTestId('settle-slash-chan-777').click();
  await expect(settlement.locator('text=SLASHED').first()).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(500);
  expect(mswUnhandled).toEqual([]);
});
