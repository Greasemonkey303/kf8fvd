import { defineConfig } from 'vitest/config'

// Keep Playwright e2e tests separate from Vitest unit/integration runs.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    exclude: ['tests/playwright/**', 'tests/e2e/**'],
    environment: 'node'
  }
})
