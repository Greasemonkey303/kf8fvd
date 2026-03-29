import { test } from '@playwright/test'
import { expect } from '@playwright/test'

test('admin routes require authentication', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  const url = page.url()
  const hasSigninForm = await page.locator('input[name="email"]').count()
  const hasUnauthorized = await page.getByText(/unauthorized|sign in/i).count()

  expect(url.includes('/signin') || hasSigninForm > 0 || hasUnauthorized > 0).toBeTruthy()
})
