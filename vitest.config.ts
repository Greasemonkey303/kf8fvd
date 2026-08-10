import path from 'path'
import { defineConfig } from 'vitest/config'

// Keep Playwright e2e tests separate from Vitest unit/integration runs.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    exclude: ['tests/playwright/**', 'tests/e2e/**'],
    environment: 'node',
    setupFiles: ['tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'lib/deletionArchive.ts',
        'lib/encryption.ts',
        'lib/objectKeyPolicy.ts',
        'lib/turnstile.ts',
        'lib/uploadValidation.ts',
      ],
      thresholds: {
        branches: 35,
        functions: 45,
        lines: 45,
        statements: 45,
      },
    },
  }
})
