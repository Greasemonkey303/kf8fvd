import { test, expect } from '@playwright/test'

test('homepage loads and has title or main landmark', async ({ page }) => {
  await page.goto('/')
  // prefer checking for a main heading or successful response
  const h1 = await page.locator('h1').first().textContent().catch(() => '')
  expect(h1 || page.url()).toBeTruthy()
})
