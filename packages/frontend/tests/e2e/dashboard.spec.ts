import { test, expect } from '@playwright/test';

test('has title and loads dashboard', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('GPU stall due to ReadPixels') || text.includes('GL Driver Message')) return;
    console.log('BROWSER CONSOLE:', text);
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.route('**/api/agents', async (route) => route.fulfill({ json: { agents: [] } }));
  await page.route('**/api/governance/proposals', async (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route('**/api/settlement/channels', async (route) => route.fulfill({ json: { channels: [] } }));
  
  await page.addInitScript(() => {
    class MockEventSource {
      onmessage: any = null;
      onerror: any = null;
      readyState: number = 1;
      constructor() {
        setTimeout(() => {
          if (this.onmessage) this.onmessage({ data: JSON.stringify({ agents: [], state: { logs: [] } }) });
        }, 100);
      }
      close() {}
    }
    (window as any).EventSource = MockEventSource;
    window.localStorage.clear();
    window.localStorage.setItem('lex-atc-tour-seen', 'true');
    window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', uiPreferences: { theme: 'dark', viewMode: 'operator', panels: { terminal: { isOpen: true }, queue: { isOpen: true }, tactical: { isOpen: true }, l4: { isOpen: true } }, panelOrder: [], sidebar: { sections: { ops: true, overview: true, l4: true, agents: true }, sectionOrder: ['overview', 'l4', 'ops', 'agents'] }, terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
  });
  
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/frontend/i);

  // Expect some element to be visible
  await expect(page.locator('body')).toBeVisible({ timeout: 15000 });

  // Test some basic interaction, like clicking a tab or panel
  // Just ensure no white screen
});
