// @ts-check
/**
 * Playwright configuration for Credimed smoke + functional tests.
 *
 * The site under test is the live GitHub Pages deployment at
 * https://credimed.us (or whatever CREDIMED_BASE_URL points to).
 * We do NOT spin up a local dev server — the site is plain static
 * HTML and reaches AWS-backed Cognito/Lambda directly, so testing
 * against the real deployment is closer to production than mocking.
 *
 * Override the base URL for local dev:
 *   CREDIMED_BASE_URL=http://localhost:8080 npm test
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',

  use: {
    baseURL: process.env.CREDIMED_BASE_URL || 'https://credimed.us',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Standard timeouts: site is mostly static + a few Lambda calls */
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    /* Chromium covers ~70% of US web traffic and is the cheapest to
       run in CI. Add Firefox / WebKit projects when we have a real
       cross-browser bug budget. */
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
