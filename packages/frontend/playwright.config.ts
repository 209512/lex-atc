import { defineConfig, devices } from '@playwright/test';

const e2eMode = (process.env.E2E_MODE || '').toLowerCase();
const mswEnabled = e2eMode ? e2eMode !== 'backend' : true;

const webServerEnv = mswEnabled
  ? 'VITE_ENABLE_MSW=true VITE_API_URL=/api'
  : 'VITE_ENABLE_MSW=false';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : (process.env.RECORD_VIDEO === 'true' ? 1 : undefined),
  reporter: 'html',
  use: {
    baseURL: process.env.VITE_APP_URL || 'http://127.0.0.1:5180',
    trace: 'on-first-retry',
    // Set to 'on' to record video for all tests, 'retain-on-failure' to keep only failed tests, or 'off'
    video: process.env.RECORD_VIDEO === 'true' ? 'on' : 'retain-on-failure', 
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }, // Record in 1080p
        launchOptions: {
          args: [
            // Do not disable GPU to ensure WebGL is rendered
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      },
      testIgnore: ['**/backend-mode.spec.ts'],
    },
    {
      name: 'chromium-backend',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.VITE_BACKEND_APP_URL || 'http://127.0.0.1:5181',
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
      testMatch: ['**/backend-mode.spec.ts'],
    },
  ],
  webServer: [
    {
      command: `${webServerEnv} pnpm --filter @lex-atc/shared build && ${webServerEnv} pnpm --filter frontend build && ${webServerEnv} pnpm --filter frontend preview --port 5180 --strictPort`,
      url: process.env.VITE_APP_URL || 'http://127.0.0.1:5180',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'VITE_ENABLE_MSW=false VITE_API_URL=http://127.0.0.1:3000/api pnpm --filter frontend dev --host 127.0.0.1 --port 5181 --strictPort',
      url: process.env.VITE_BACKEND_APP_URL || 'http://127.0.0.1:5181',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
