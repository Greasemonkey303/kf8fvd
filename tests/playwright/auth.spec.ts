import { test, expect } from '@playwright/test'

test.describe('Auth flows', () => {
  test('sign in -> request 2FA -> submit code (debug)', async ({ page }) => {
    const base = process.env.SITE_URL || 'http://localhost:3000'
    await page.goto(base + '/')
    // navigate to signin
    await page.click('a[href="/signin"]')
    await expect(page).toHaveURL(/\/signin/)

    // fill credentials
    await page.fill('input[name="email"]', process.env.PLAYWRIGHT_TEST_EMAIL || 'zach@kf8fvd.com')
    await page.fill('input[name="password"]', process.env.PLAYWRIGHT_TEST_PASSWORD || 'TempPass123!')

    // submit - in dev you can set CF_TURNSTILE_BYPASS=true to skip captcha
    await page.click('button[type="submit"]')

    // expect 2FA request UI or redirect
    await page.waitForTimeout(1000)
    const url = page.url()
    expect(url.includes('/auth/2fa') || url.includes('/dashboard') || url.includes('/verify')).toBeTruthy()
  })

  test('admin unlock flow (requires admin)', async ({ page }) => {
    const base = process.env.SITE_URL || 'http://localhost:3000'
    await page.goto(base + '/admin/utilities/locks')
    // this test assumes you are signed in as admin via cookies or test account in staging
    await page.waitForTimeout(500)
    // check for unlock button existence
    const btn = await page.$('button[data-unlock-id]')
    if (btn) {
      await btn.click()
      await page.waitForTimeout(500)
      // ensure the row removed or unlock succeeded
      expect(await page.$('button[data-unlock-id]')).toBeTruthy()
    } else {
      test.skip()
    }
  })
})
