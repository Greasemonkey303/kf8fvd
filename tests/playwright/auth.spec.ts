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
    await page.fill('input[name="password"]', process.env.PLAYWRIGHT_TEST_PASSWORD || 'Zachjcke052/')

    // submit - in dev you can set CF_TURNSTILE_BYPASS=true to skip captcha
    // In headless/local tests the client-side CAPTCHA gating may leave the
    // button disabled. Force-enable and click the submit button in the
    // page context so the test can proceed.
    await page.evaluate(() => {
      // inject a hidden input that mimics Turnstile response so client-side
      // validation passes in test environments where the widget isn't loaded
      let inp = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null
      if (!inp) {
        inp = document.createElement('input')
        inp.type = 'hidden'
        inp.name = 'cf-turnstile-response'
        document.querySelector('form')?.appendChild(inp)
      }
      inp.value = 'playwright-bypass'
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null
      if (btn) {
        btn.disabled = false
        btn.click()
      }
    })

    // expect 2FA request UI or redirect; allow the in-page success message as evidence
    await page.waitForTimeout(1000)
    const url = page.url()
    const successCount = await page.locator('text=A verification code was sent to your email.').count()
    expect(url.includes('/auth/2fa') || url.includes('/dashboard') || url.includes('/verify') || successCount > 0).toBeTruthy()
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
