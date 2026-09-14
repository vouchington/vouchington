import { defineConfig, devices } from '@playwright/test'

const workerPort = process.env.WORKER_PORT
const workerUrl = process.env.LOCALIZATION_TMUX_WORKER_URL

if (!workerPort) throw new TypeError('WORKER_PORT is required; run ./dev/initialize web first')
if (!workerUrl) throw new TypeError('LOCALIZATION_TMUX_WORKER_URL is required from local smoke')
const workerAddress = new URL(workerUrl)
if (
  workerAddress.hostname !== 'localhost' ||
  workerAddress.port !== workerPort ||
  (workerAddress.protocol !== 'http:' && workerAddress.protocol !== 'https:')
) {
  throw new TypeError('LOCALIZATION_TMUX_WORKER_URL must be the local Worker')
}

export default defineConfig({
  testDir: './tests/routes',
  testMatch: 'localization-tmux-smoke.spec.mts',
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: workerUrl,
    testIdAttribute: 'data-pw',
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
})
