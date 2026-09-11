// Credentialed E2E suite — requires real cloud credentials (AWS S3, OpenAI).
// Uses the same server topology as playwright.config.mts but adds the CPU worker
// (ai_agents queue consumer) started in credentialed-global-setup.mts so chat
// jobs are processed end-to-end, and pins WORKER_PORT=8787 so the S3 CORS
// allow-list matches the browser Origin.
//
// Run locally (after source .env with real creds + prior build):
//   WORKER_PORT=8787 pnpm exec playwright test --config playwright.credentialed.config.mts --reporter=line
//
// In CI this config is invoked only by tests-playwright-credentialed.yml, which
// gates on trusted_secret_context (never runs on dependabot / fork PRs).

import { defineConfig } from '@playwright/test'
import { CHROMIUM_USE, CI, createPlaywrightConfig } from './playwright/config/shared-config.mts'

const reuseExistingServer = !CI

export default defineConfig(
  createPlaywrightConfig({
    testDir: './playwright/credentialed',
    timeout: 90_000,
    junitOutputFile: 'credentialed-test-report.junit.xml',
    backendCommand: 'NODE_ENV=test PLAYWRIGHT_TEST=true node backend/entrypoints/api/serve.mts',
    reuseExistingServer,
    projects: [{ name: 'chromium', use: CHROMIUM_USE }],
    globalSetup: './playwright/credentialed-global-setup.mts',
  }),
)
