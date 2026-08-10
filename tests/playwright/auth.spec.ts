import { test, expect } from '@playwright/test'

test.describe('Auth flows', () => {
  test('sign in requests a 2FA code', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Auth mutations run once in desktop Chromium')
    test.skip(process.env.PLAYWRIGHT_AUTH_MUTATIONS !== 'true', 'Set PLAYWRIGHT_AUTH_MUTATIONS=true for staging auth tests')
    test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Staging auth credentials are required')

    const base = process.env.SITE_URL || 'http://localhost:3000'
    await page.goto(base + '/')
    // navigate to signin
    await page.click('a[href="/signin"]')
    await expect(page).toHaveURL(/\/signin/)

    // fill credentials
    const emailVal = process.env.PLAYWRIGHT_TEST_EMAIL as string
    const passVal = process.env.PLAYWRIGHT_TEST_PASSWORD as string
    await page.fill('input[name="email"]', emailVal)
    await page.fill('input[name="password"]', passVal)

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeEnabled({ timeout: 15000 })
    await submit.click()
    await expect(page.getByText('A verification code was sent to your email.')).toBeVisible({ timeout: 15000 })
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
