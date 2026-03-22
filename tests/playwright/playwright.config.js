// Playwright configuration for smoke/E2E tests
const { devices } = require('@playwright/test')

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests/playwright/tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  use: {
    actionTimeout: 0,
    baseURL: process.env.PW_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
}
const { devices } = require('@playwright/test');

module.exports = {
  // Run tests in this directory (the config lives inside tests/playwright)
  testDir: '.',
  timeout: 30 * 1000,
  use: {
    baseURL: process.env.SITE_URL || 'http://localhost:3000',
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] }
  ]
}
