import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.resolve(repoRoot, 'docs', 'assets', 'ui');
const baseURL = process.env.UI_SCREENSHOT_BASE_URL || 'http://127.0.0.1:5180';
const serverEnv = { ...process.env, VITE_ENABLE_MSW: 'true', VITE_API_URL: '/api' };

fs.mkdirSync(outDir, { recursive: true });

const waitForHttpOk = async (url, timeoutMs = 120000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
};

const startPreviewServer = async () => {
  try {
    await waitForHttpOk(baseURL, 1500);
    return null;
  } catch {}

  const cmd = [
    'pnpm --filter @lex-atc/shared build',
    'pnpm --filter frontend build',
    'pnpm --filter frontend preview --port 5180 --strictPort',
  ].join(' && ');

  const child = spawn(cmd, {
    cwd: repoRoot,
    env: serverEnv,
    shell: true,
    stdio: 'inherit',
  });

  await waitForHttpOk(baseURL, 120000);
  return child;
};

const docUrl = (pathname, { ids = [], scenario = '' } = {}) => {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const qs = new URLSearchParams();
  qs.set('doc', '1');
  if (scenario) qs.set('scenario', scenario);
  if (list.length) qs.set('hl', list.join(','));
  const p = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${String(pathname || '/')}`;
  return `${baseURL}${p}?${qs.toString()}`;
};

const addCaptions = async (page, ids) => {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return;
  await page.evaluate((entries) => {
    const existing = document.getElementById('lex-atc-doc-captions');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'lex-atc-doc-captions';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '2147483647';
    root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    root.style.fontSize = '12px';

    const createLabel = (left, top, text) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.position = 'fixed';
      el.style.left = `${Math.max(8, Math.round(left))}px`;
      el.style.top = `${Math.max(8, Math.round(top))}px`;
      el.style.padding = '4px 6px';
      el.style.borderRadius = '8px';
      el.style.border = '1px solid rgba(56,189,248,0.55)';
      el.style.background = 'rgba(2,6,23,0.78)';
      el.style.color = 'rgba(226,232,240,0.98)';
      el.style.backdropFilter = 'blur(6px)';
      el.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
      el.style.whiteSpace = 'nowrap';
      return el;
    };

    const getLabel = (target, id) => {
      const direct = target.getAttribute('data-doc-label');
      if (direct) return direct;
      const aria = target.getAttribute('aria-label');
      if (aria) return aria;
      const title = target.getAttribute('title');
      if (title) return title;
      const text = (target.textContent || '').trim().replace(/\s+/g, ' ');
      if (text && text.length <= 48) return text;
      return id;
    };

    for (const { id } of entries) {
      const target = document.querySelector(`[data-testid="${id}"]`);
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      const left = rect.left;
      const top = rect.top - 28;
      root.appendChild(createLabel(left, top, getLabel(target, id)));
    }

    document.body.appendChild(root);
  }, list.map((id) => ({ id })));
};

const clearCaptions = async (page) => {
  await page.evaluate(() => {
    const el = document.getElementById('lex-atc-doc-captions');
    if (el) el.remove();
  });
};

const main = async () => {
  const server = await startPreviewServer();
  let browser = null;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.addInitScript(() => {
      try { localStorage.setItem('lex-atc-tour-seen', 'true'); } catch {}
    });

    await page.goto(docUrl('/', {}), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="traffic-control-title"]', { timeout: 60000 });
    await page.waitForTimeout(750);

    await page.screenshot({ path: path.join(outDir, '01-dashboard.png'), fullPage: false, timeout: 120000 });

    const header = page.locator('[data-testid="traffic-control-title"]').first();
    await header.screenshot({ path: path.join(outDir, '02-sidebar-header.png'), timeout: 120000 });
    await page.goto(docUrl('/', { ids: ['traffic-control-title', 'deployment-mode-badge', 'sse-status-badge', 'sse-stale-badge'] }), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await addCaptions(page, ['traffic-control-title', 'deployment-mode-badge', 'sse-status-badge', 'sse-stale-badge']);
    await page.screenshot({ path: path.join(outDir, '02-sidebar-header-hl.png'), fullPage: false, timeout: 120000 });
    await clearCaptions(page);

    const takeover = page.locator('[data-testid="btn-emergency-takeover"]').first();
    if (await takeover.count()) {
      await takeover.screenshot({ path: path.join(outDir, '03-emergency-takeover.png'), timeout: 120000 });
      await page.goto(docUrl('/', { ids: ['btn-emergency-takeover', 'btn-release-lock'] }), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await addCaptions(page, ['btn-emergency-takeover', 'btn-release-lock']);
      await page.screenshot({ path: path.join(outDir, '03-emergency-takeover-hl.png'), fullPage: false, timeout: 120000 });
      await clearCaptions(page);
    }

    const ops = page.locator('[data-testid="panel-ops"]').first();
    if (await ops.count()) {
      await ops.screenshot({ path: path.join(outDir, '04-operations.png'), timeout: 120000 });
      await page.goto(docUrl('/', { ids: ['panel-ops', 'ops-governance', 'ops-isolation', 'ops-settlement'] }), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await addCaptions(page, ['panel-ops', 'ops-governance', 'ops-isolation', 'ops-settlement']);
      await page.screenshot({ path: path.join(outDir, '04-operations-hl.png'), fullPage: false, timeout: 120000 });
      await clearCaptions(page);
    }

    const tactical = page.locator('[data-testid="panel-tactical"]').first();
    if (await tactical.count()) {
      await tactical.screenshot({ path: path.join(outDir, '05-tactical.png'), timeout: 120000 });
      await page.goto(docUrl('/', { ids: ['panel-tactical', 'btn-minimize-tactical'] }), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await addCaptions(page, ['panel-tactical', 'btn-minimize-tactical']);
      await page.screenshot({ path: path.join(outDir, '05-tactical-hl.png'), fullPage: false, timeout: 120000 });
      await clearCaptions(page);
    }

    const terminal = page.locator('[data-testid="panel-terminal"]').first();
    if (await terminal.count()) {
      await terminal.screenshot({ path: path.join(outDir, '06-terminal.png'), timeout: 120000 });
      await page.goto(docUrl('/', { ids: ['panel-terminal', 'btn-minimize-terminal', 'btn-close-terminal'] }), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await addCaptions(page, ['panel-terminal', 'btn-minimize-terminal', 'btn-close-terminal']);
      await page.screenshot({ path: path.join(outDir, '06-terminal-hl.png'), fullPage: false, timeout: 120000 });
      await clearCaptions(page);
    }

    await page.goto(docUrl('/status-system', {}), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '07-status-system.png'), fullPage: false, timeout: 120000 });
    await page.goto(docUrl('/status-system', { ids: ['l4-status-guide'] }), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await addCaptions(page, ['l4-status-guide']);
    await page.screenshot({ path: path.join(outDir, '07-status-system-hl.png'), fullPage: false, timeout: 120000 });
    await clearCaptions(page);

    await page.goto(docUrl('/', { scenario: 'dispute-repeat', ids: ['panel-dispute-context', 'panel-terminal'] }), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await addCaptions(page, ['panel-dispute-context', 'panel-terminal']);
    await page.screenshot({ path: path.join(outDir, '08-dispute-repeat-hl.png'), fullPage: false, timeout: 120000 });
    await clearCaptions(page);

    await page.goto(docUrl('/', { scenario: 'sandbox-denials', ids: ['panel-terminal'] }), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await addCaptions(page, ['panel-terminal']);
    await page.screenshot({ path: path.join(outDir, '09-sandbox-denials-hl.png'), fullPage: false, timeout: 120000 });
    await clearCaptions(page);

    await page.goto(docUrl('/', { scenario: 'settlement-retry', ids: ['panel-slashing-heatmap', 'panel-terminal'] }), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await addCaptions(page, ['panel-slashing-heatmap', 'panel-terminal']);
    await page.screenshot({ path: path.join(outDir, '10-settlement-retry-hl.png'), fullPage: false, timeout: 120000 });
    await clearCaptions(page);
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
};

main().catch((e) => {
  process.stderr.write(`${String(e?.stack || e)}\n`);
  process.exit(1);
});
