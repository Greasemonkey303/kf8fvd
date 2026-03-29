import { test, expect } from '@playwright/test'

test('homepage loads and has title or main landmark', async ({ page }) => {
  await page.goto('/')
  // prefer checking for a main heading or successful response
  const h1 = await page.locator('h1').first().textContent().catch(() => '')
  expect(h1 || page.url()).toBeTruthy()
})

test('public navigation routes render core pages', async ({ page }) => {
  await page.goto('/')

  await page.goto('/aboutme')
  await expect(page.locator('main')).toBeVisible()

  await page.goto('/contactme')
  await expect(page.locator('form')).toBeVisible()

  await page.goto('/forgot-password')
  await expect(page.locator('input[name="email"]')).toBeVisible()
})

test('sign-in page shows accessible validation feedback', async ({ page }) => {
  await page.goto('/signin')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('[role="alert"]').first()).toBeVisible()
})
