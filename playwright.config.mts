import { defineConfig } from '@playwright/test'
import { CHROMIUM_USE, createPlaywrightConfig } from './playwright/config/shared-config.mts'

export default defineConfig(
  createPlaywrightConfig({
    testDir: './playwright/tests',
    timeout: 60_000,
    junitOutputFile: 'test-report.junit.xml',
    backendCommand:
      'NODE_ENV=test PLAYWRIGHT_TEST=true SKIP_CAPTCHA_VERIFICATION=true node backend/entrypoints/api/serve.mts',
    reuseExistingServer: false,
    projects: [
      {
        name: 'setup',
        testDir: './playwright/setup',
        testMatch: '**/*.setup.mts',
        use: CHROMIUM_USE,
      },
      { name: 'chromium', use: CHROMIUM_USE, dependencies: ['setup'] },
    ],
  }),
)
