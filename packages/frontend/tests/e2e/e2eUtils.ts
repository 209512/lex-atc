import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const waitForAppMounted = async (page: Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.lexAtcMounted === '1', null, { timeout: 30000 });
};

export const waitForMswReady = async (page: Page) => {
  await page.waitForFunction(() => (window as any).__LEX_ATC__?.msw?.ready === true, null, { timeout: 30000 });
  const ok = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/__msw/health', { credentials: 'include' });
      return res.ok;
    } catch {
      return false;
    }
  });
  expect(ok).toBeTruthy();
};

export const waitForAppStateReady = async (page: Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.lexAtcStateReady === '1', null, { timeout: 30000 });
};

