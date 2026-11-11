import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '4321';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // SwiftShader cold starts and the 106-character world can delay hydration
  // and click actionability beyond Playwright's 30s defaults.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  // The unified world renders a large WebGL scene per page. Running several
  // SwiftShader contexts at once starves the browser and turns otherwise
  // deterministic camera/hydration assertions into timeouts.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
