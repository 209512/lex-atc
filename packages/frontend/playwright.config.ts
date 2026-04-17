import { defineConfig, devices } from '@playwright/test';

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
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter backend dev',
      url: 'http://127.0.0.1:3000/api/doctor',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command:
        'VITE_API_URL=http://127.0.0.1:3000/api VITE_SSE_URL=http://127.0.0.1:3000/api/stream pnpm build && pnpm preview --port 5180 --strictPort',
      url: process.env.VITE_APP_URL || 'http://127.0.0.1:5180',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
