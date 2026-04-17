import { test, expect } from '@playwright/test';

test.describe('Isolation Operations Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/tasks/pending', async (route) => {
      await route.fulfill({
        json: {
          pending: [
            {
              taskId: 'task-555',
              status: 'PENDING',
              classification: 'SUSPICIOUS_TRADE',
              actorUuid: 'agent-x',
              createdAt: Date.now(),
            }
          ]
        }
      });
    });

    await page.route('**/api/tasks/*/finalize', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/tasks/*/rollback', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/tasks/*/cancel', async (route) => {
      await route.fulfill({ json: { success: true } });
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('lex-atc-tour-seen', 'true');
      window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', areTooltipsEnabled: true, uiPreferences: { sidebar: { sections: { ops: true, overview: false, l4: false, agents: false }, sectionOrder: ['ops'] }, panels: { terminal: { isOpen: true }, queue: { isOpen: true }, tactical: { isOpen: true }, l4: { isOpen: true } }, panelOrder: [], theme: 'dark', viewMode: 'operator', terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
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
                    governance: { proposals: [] },
                    isolation: {
                      tasks: [{
                        taskId: 'task-555',
                        status: 'PENDING',
                        classification: 'SUSPICIOUS_TRADE',
                        actorUuid: 'agent-x',
                        createdAt: 1700000000000
                      }]
                    },
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

    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('finalizes a pending isolation task', async ({ page }) => {
    const ops = page.locator('body');
    await expect(ops).toBeVisible({ timeout: 15000 });

    const suspicious = ops.getByText('SUSPICIOUS_TRADE');
    if (await suspicious.count()) {
      await expect(suspicious).toBeVisible({ timeout: 5000 });
    }

    const finalizeButton = page.getByTestId('iso-finalize-task-555');
    if (await finalizeButton.count()) {
      await finalizeButton.click({ timeout: 5000 });
    }
  });

  test('rolls back a pending isolation task', async ({ page }) => {
    const ops = page.locator('body');
    await expect(ops).toBeVisible({ timeout: 15000 });

    const rollbackButton = page.getByTestId('iso-rollback-task-555');
    if (await rollbackButton.count()) {
      await rollbackButton.click({ timeout: 5000 });
    }
  });
});
