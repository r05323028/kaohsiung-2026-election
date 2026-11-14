import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '4321';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // SwiftShader cold starts and the 106-character world can delay hydration
  // and click actionability beyond Playwright's 30s defaults.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  // Headless Chromium falls back to SwiftShader on macOS, which makes every
  // WebGL-heavy test 4-6x slower. A headed local browser uses the GPU and can
  // safely run two workers; CI stays headless and serial for reproducibility.
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? 1 : 2)),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // CI keeps the list output and writes an HTML report for failed-run artifacts.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Set PLAYWRIGHT_HEADLESS=1 when running on a display-less machine.
    headless:
      Boolean(process.env.CI) || process.env.PLAYWRIGHT_HEADLESS === '1',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    // Astro auto-backgrounds when launched by a coding agent; --ignore-lock keeps this
    // Playwright-managed process in the foreground.
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
