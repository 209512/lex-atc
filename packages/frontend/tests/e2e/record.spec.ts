import { test } from '@playwright/test';

const apiBase = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:3000/api';

test.setTimeout(120000);

const addBanner = async (page: any, text: string) => {
  await page.evaluate((t: string) => {
    const id = 'lex-e2e-banner';
    let el = document.getElementById(id) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.left = '16px';
      el.style.top = '16px';
      el.style.zIndex = '2147483647';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '999px';
      el.style.background = 'rgba(0,0,0,0.70)';
      el.style.color = 'rgba(255,255,255,0.95)';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      el.style.fontSize = '12px';
      el.style.fontWeight = '700';
      el.style.letterSpacing = '0.06em';
      el.style.pointerEvents = 'none';
      el.style.boxShadow = '0 12px 30px rgba(0,0,0,0.35)';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.locator('#lex-e2e-banner').waitFor({ state: 'visible' });
};

const safePost = async (request: any, url: string, data?: any) => {
  console.log(`[E2E] Sending POST to ${url}`, data || '');
  const response = await request.post(url, { data, timeout: 5000 }).catch((e: any) => {
    console.error(`[safePost Error] POST ${url} failed:`, e.message);
  });
  if (response) {
    if (!response.ok()) {
      console.error(`[safePost Error] POST ${url} returned ${response.status()} ${response.statusText()}`);
    } else {
      console.log(`[E2E] POST ${url} SUCCESS:`, await response.json());
    }
  }
};

test.beforeEach(async ({ page, request }) => {
  // Prevent the Joyride tour from showing up during video recording
  await page.addInitScript(() => {
    window.localStorage.setItem('lex-atc-tour-seen', 'true');
    
    // Set UI layout for 1080p to prevent overlapping panels
    // Terminal, Tactical, Queue are floating panels.
    // At 1920x1080, we want them neatly arranged.
    window.localStorage.setItem('lex-atc.ui-state.v3', JSON.stringify({
      state: {
        isDark: true,
        sidebarWidth: 320,
        viewMode: "detached",
        areTooltipsEnabled: true,
        uiPreferences: {
          panels: {
            terminal: { x: 20, y: 20, isOpen: true, isCollapsed: false, width: 640, height: 360 },
            tactical: { x: 1280, y: 20, isOpen: true, isCollapsed: false, width: 320, height: 600 },
            queue: { x: 20, y: 400, isOpen: true, isCollapsed: false, width: 360, height: 320 },
            l4: { x: 20, y: 720, isOpen: true, width: 760, height: 320 }
          },
          panelOrder: ['l4', 'terminal', 'tactical', 'queue'],
          viewMode: 'operator',
          theme: 'dark',
          fontSizeMode: 'medium',
          reduceMotion: false,
          limitFps: false,
          queue: { activeTab: 'all' },
          tactical: { filterMode: 'all' },
          terminal: { filter: 'ALL', domainFilter: 'ALL', actionKeyFilter: 'ALL', showOnlyEconomy: false, autoScroll: true },
          sidebar: { sectionOrder: ['overview', 'l4', 'ops', 'agents'], sections: { overview: true, l4: true, ops: true, agents: true } },
          l4: { rightPanel: 'summary' }
        }
      },
      version: 0
    }));
  });

  // Inject a script to simulate mouse wheel scrolling to zoom out the radar
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      // Apply a small CSS zoom to scale down UI panels (Command + '-')
      const style = document.createElement('style');
      style.innerHTML = `
        #root > main > div:last-child {
          transform: scale(0.85);
          transform-origin: top left;
          width: 117%;
          height: 117%;
        }
        #root > main > div:first-child {
          width: 100vw !important;
          height: 100vh !important;
        }
      `;
      document.head.appendChild(style);
    });
  });
  
  // Mock API requests
  // WE REMOVE THE MOCK API SO IT TESTS AGAINST THE REAL BACKEND
  /*
    await page.route('**' + '/api/agents', async (route) => {
        await route.fulfill({ json: { agents: [{ uuid: 'agent-1', id: 'Agent-1', status: 'ACTIVE', account: { balance: 100, reputation: 50 }, position: { x: 0, y: 0, z: 0 } }] } });
    });
    await page.route('**' + '/api/governance/proposals', async (route) => {
        await route.fulfill({ json: { proposals: [] } });
    });
    await page.route('**' + '/api/governance/proposals/' + '*' + '/approve', async (route) => {
        await route.fulfill({ json: { success: true } });
    });
    await page.route('**' + '/api/governance/proposals/' + '*' + '/execute', async (route) => {
        await route.fulfill({ json: { success: true } });
    });
    await page.route('**' + '/api/settlement/channels', async (route) => {
        await route.fulfill({ json: { channels: [] } });
    });
    await page.route('**' + '/api/override', async (route) => {
        await route.fulfill({ json: { success: true } });
    });
    await page.route('**' + '/api/agents/' + '*' + '/priority', async (route) => {
        await route.fulfill({ json: { success: true } });
    });
    await page.route('**' + '/api/settlement/slash', async (route) => {
        await route.fulfill({ json: { success: true } });
    });
  */

  await safePost(request, `${apiBase}/release`);
  await safePost(request, `${apiBase}/stop`, { enable: false });
  await safePost(request, `${apiBase}/agents/scale`, { count: 2 });
  await safePost(request, `${apiBase}/agents/priority-order`, { order: [] });
  await page.waitForTimeout(250);
  });

// Helper function to zoom out the radar using Playwright's mouse.wheel
const zoomOutRadar = async (page: any) => {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  
  // Move mouse to center of screen (over the canvas)
  await page.mouse.move(960, 540);
  
  // Scroll down (zoom out) multiple times to give OrbitControls time to react
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(100);
  }
};

test.describe('Lex-ATC Demo Scenarios', () => {
  test.describe.configure({ mode: 'serial' });
  
  test.beforeAll(async ({ browser }) => {
    // Warm up the frontend to avoid Vite initial compilation white screen
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(apiBase.replace('/api', '/')).catch(() => {});
    await context.close();
  });

  // Test 1: Peaceful Autonomous Competition
  test('1_Peaceful_Nominal_State', async ({ page, request }) => {
    // Before scenario, make sure we have 6 agents (so it looks crowded and busy)
    await safePost(request, `${apiBase}/agents/scale`, { count: 6 });
    await page.waitForTimeout(2000);

    await page.goto('/');
    await zoomOutRadar(page);
    await addBanner(page, 'Scenario 1/4: Peaceful Nominal State');
    await page.waitForTimeout(10000);
  });

  // Test 2: Tactical Command & Priority Bidding
  test('2_Tactical_Command_Priority', async ({ page, request }) => {
    await safePost(request, `${apiBase}/agents/scale`, { count: 6 });
    await page.goto('/');
    await zoomOutRadar(page);
    await addBanner(page, 'Scenario 2/4: Tactical Command & Priority');
    await page.waitForTimeout(5000);
    
    // Dynamically fetch agents to get a real UUID
    const res = await request.get(`${apiBase}/agents/status`);
    const data = await res.json();
    const agents = Array.isArray(data) ? data : (data.agents || []);
    console.log(`[E2E] Fetched agents for Scenario 2:`, agents.length);
    if (agents.length > 0) {
      const targetId = agents[0].uuid || agents[0].id;
      
      // Simulate UI interaction: Click the Priority button in the Tactical Panel
      const priorityBtn = page.locator(`[data-testid="btn-priority-${targetId}"]`).first();
      if (await priorityBtn.isVisible()) {
        console.log(`[E2E] Found Priority button for ${targetId}, clicking...`);
        await priorityBtn.click();
      } else {
        console.log(`[E2E] Priority button not visible, falling back to API`);
        await safePost(request, `${apiBase}/agents/${targetId}/priority`, { enable: true });
      }
    }
    await page.waitForTimeout(10000);
  });


  // Test 3: Smart Alerts & Automated Slashing
  test('3_Escalation_Slashing', async ({ page, request }) => {
    await safePost(request, `${apiBase}/agents/scale`, { count: 6 });
    await page.goto('/');
    await zoomOutRadar(page);
    await addBanner(page, 'Scenario 3/4: Escalation & Slashing');
    await page.waitForTimeout(5000);
    
    // Dynamically fetch agents to get a real UUID
    const res = await request.get(`${apiBase}/agents/status`);
    const data = await res.json();
    const agents = Array.isArray(data) ? data : (data.agents || []);
    console.log(`[E2E] Fetched agents for Scenario 3:`, agents.length);
    
    if (agents.length > 0) {
      const targetId = agents[agents.length - 1].uuid || agents[agents.length - 1].id;
      
      // Simulate UI interaction: Click the Slash button in the Tactical Panel
      const slashBtn = page.locator(`[data-testid="btn-slash-${targetId}"]`).first();
      if (await slashBtn.isVisible()) {
        console.log(`[E2E] Found Slash button for ${targetId}, clicking...`);
        await slashBtn.click();
        await page.waitForTimeout(1000);
        
        // Click Submit in the Operations Modal
        const submitBtn = page.locator('button', { hasText: 'SUBMIT' }).first();
        if (await submitBtn.isVisible()) {
          console.log(`[E2E] Clicking SUBMIT in operations modal...`);
          await submitBtn.click();
        }
      } else {
        console.log(`[E2E] Slash button not visible, falling back to API`);
        await safePost(request, `${apiBase}/settlement/slash`, { channelId: `channel:${targetId}`, actorUuid: targetId, reason: 'MALICIOUS_BEHAVIOR' });
      }
    }
    
    // Wait for the Slashing Heatmap and UI alerts to display
    await page.waitForTimeout(10000);
  });

  // Test 4: Global Governance & Emergency Override
  test('4_Emergency_Takeover', async ({ page, request }) => {
    await safePost(request, `${apiBase}/agents/scale`, { count: 6 });
    await page.goto('/');
    await zoomOutRadar(page);
    await addBanner(page, 'Scenario 4/4: Emergency Override');
    await page.waitForTimeout(5000);

    await safePost(request, `${apiBase}/override`);

    await page.waitForTimeout(8000);

    await safePost(request, `${apiBase}/release`);
    await page.waitForTimeout(4000);
  });
});
