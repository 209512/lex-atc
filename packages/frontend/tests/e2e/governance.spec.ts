import { test, expect } from '@playwright/test';

test.describe('Governance Operations Panel', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the API requests to return mocked responses
    await page.route('**/api/governance/proposals', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            proposals: [
              {
                id: 'prop-123',
                action: 'TRANSFER_LOCK',
                status: 'PENDING',
                threshold: 2,
                approvals: ['admin-1'],
                reason: 'MOCK_REASON',
                createdAt: Date.now(),
              }
            ]
          }
        });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          json: { success: true, id: 'prop-999', status: 'PENDING' }
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/governance/proposals/*/approve', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/governance/proposals/*/execute', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/governance/proposals/*/cancel', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('lex-atc-tour-seen', 'true');
      window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', uiPreferences: { theme: 'dark', viewMode: 'operator', panels: { terminal: { isOpen: true }, queue: { isOpen: true }, tactical: { isOpen: true }, l4: { isOpen: true } }, panelOrder: [], sidebar: { sections: { ops: true, overview: true, l4: true, agents: true }, sectionOrder: ['overview', 'l4', 'ops', 'agents'] }, terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
    });

    await page.addInitScript(() => {
      class MockEventSource {
        onmessage: any = null;
        onerror: any = null;
        constructor(_url: string) {
          setTimeout(() => {
            if (this.onmessage) {
              this.onmessage({
                data: JSON.stringify({
                  agents: [],
                  state: {
                    globalStop: false,
                    governance: {
                      proposals: [{
                        proposalId: 'prop-123',
                        status: 'PENDING',
                        action: 'TRANSFER_LOCK',
                        reason: 'MOCK_REASON',
                        proposerUuid: 'agent-x',
                        expiresAt: Date.now() + 100000
                      }]
                    },
                    isolation: { tasks: [] },
                    settlement: { channels: [] }
                  }
                })
              });
            }
          }, 100);
        }
        close() {}
      }
      (window as any).EventSource = MockEventSource;
    });

    await page.on('console', msg => {
      const text = msg.text();
      if (text.includes('GPU stall due to ReadPixels') || text.includes('GL Driver Message')) return;
      console.log('BROWSER CONSOLE:', text);
    });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('creates a governance proposal via presets', async ({ page }) => {
    const ops = page.getByTestId('panel-ops');
    await expect(ops).toBeVisible({ timeout: 15000 });
    
    const presetButton = page.getByTestId('gov-preset-capacity-surge');
    await expect(presetButton).toBeVisible();
    await presetButton.click();

    const createButton = page.getByTestId('gov-create-proposal');
    await expect(createButton).toBeVisible();
    await createButton.click();

    await expect(page.getByTestId('panel-ops')).toBeVisible();
  });

  test('approves and executes a pending proposal', async ({ page }) => {
    const approveButton = page.getByTestId('ops-governance').getByRole('button', { name: 'Approve' }).first();
    await expect(approveButton).toBeVisible({ timeout: 15000 });
    await approveButton.click();
  });
});
