import { test, expect } from '@playwright/test';
import { waitForAppMounted, waitForAppStateReady } from './e2eUtils';

test('drone label renders and is visible', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('GPU stall due to ReadPixels') || text.includes('GL Driver Message')) return;
    console.log('BROWSER CONSOLE:', text);
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const agent = {
    id: 'agent-1',
    uuid: 'agent-1',
    displayName: 'AG1',
    position: [0, 0, 0],
    status: 'idle',
    color: '#3b82f6',
  };

  await page.route('**/api/agents', async (route) => route.fulfill({ json: { agents: [agent] } }));
  await page.route('**/api/governance/proposals', async (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route('**/api/settlement/channels', async (route) => route.fulfill({ json: { channels: [] } }));

  await page.addInitScript((payload) => {
    class MockEventSource {
      onmessage: any = null;
      onerror: any = null;
      readyState: number = 1;
      constructor() {
        setTimeout(() => {
          if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) });
        }, 100);
      }
      close() {}
    }
    (window as any).EventSource = MockEventSource;
    window.localStorage.clear();
    window.localStorage.setItem('lex-atc-tour-seen', 'true');
    window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({ state: { sidebarWidth: 450, viewMode: 'detached', uiPreferences: { theme: 'dark', viewMode: 'operator', panels: { terminal: { isOpen: false }, queue: { isOpen: false }, tactical: { isOpen: false }, l4: { isOpen: false } }, panelOrder: [], sidebar: { sections: { ops: true, overview: true, l4: true, agents: true }, sectionOrder: ['overview', 'l4', 'ops', 'agents'] }, terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL' }, l4: { rightPanel: 'summary' } } }, version: 0 }));
  }, { agents: [agent], state: { logs: [], holder: null, globalStop: false, overrideSignal: false, priorityAgents: [] } });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForAppMounted(page);
  await waitForAppStateReady(page);

  const label = page.getByTestId('agent-drone-label').first();
  await expect(label).toBeVisible({ timeout: 15000 });
  await expect(label).toContainText('AG1');
});

