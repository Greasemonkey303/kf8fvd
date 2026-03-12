const { devices } = require('@playwright/test');

module.exports = {
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
