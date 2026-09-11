/**
 * Playwright global setup - runs before all tests
 */

import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'
import { assertPlaywrightSeedData } from '../backend/scripts/seeds/playwright-seed-assertions.mts'
import { seedPlaywrightTestData } from '../backend/scripts/seeds/playwright-test-data.mts'
import { pinPlaywrightSeedCrawlAnchor } from '../backend/scripts/seeds/crawl-ids.mts'
import { invalidate } from '../backend/services/entity-cache/index.mts'
import { invalidateAnonymousSearchCaches } from '../backend/services/entity-fetch/search-caches.mts'
import { routeRateLimiters } from '../backend/services/route-rate-limits/check.mts'
import { routeRateLimitConfig } from '../backend/services/route-rate-limits/config.mts'
import {
  createWranglerRuntimeEnv,
  ensureWranglerRuntimeDirs,
  getWranglerRuntimePaths,
} from '../cloudflare-worker/scripts/wrangler/runtime.mts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PLAYWRIGHT_TOPIC_IDS = [
  '019c64e6-f710-74cb-b36d-130af8ff1067',
  '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1',
  '019c64e6-f716-722f-b05c-f4c4f7b93cd0',
  '019c64e6-b100-7000-b000-000000000001',
  '019c64e6-b200-7000-b000-000000000001',
  '019c64e6-b300-7000-b000-000000000001',
  '019c64e6-b400-7000-b000-000000000001',
]

export default async function globalSetup(_config: FullConfig) {
  // The runner may use NODE_ENV=production alongside the standalone web build. Its direct database
  // calls are test fixtures and should use the query guard's test exemption.
  process.env.NODE_ENV = 'test'
  pinPlaywrightSeedCrawlAnchor()

  // Clear CF worker's persistent cache before tests start.
  // The wrangler dev server hasn't started yet (globalSetup runs before webServers),
  // so this is safe. Without this, bot-classified requests (Playwright's headless UA)
  // receive 24-hour cached responses that may contain stale HTML from previous runs.
  // Wrangler uses the same repo-owned runtime path contract as scripts/wrangler/start.mts.
  const WORKER_PORT = process.env.WORKER_PORT || '8787'
  const runtimePaths = getWranglerRuntimePaths({
    isCi: Boolean(process.env.CI),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '0',
    tempRoot: process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(),
    workerDir: join(__dirname, '../cloudflare-worker'),
    workerPort: WORKER_PORT,
  })
  const wranglerEnv = createWranglerRuntimeEnv(process.env, runtimePaths)
  process.env.CLOUDFLARE_CF_FETCH_PATH = wranglerEnv.CLOUDFLARE_CF_FETCH_PATH
  process.env.MINIFLARE_CACHE_DIR = wranglerEnv.MINIFLARE_CACHE_DIR
  process.env.WRANGLER_CACHE_DIR = wranglerEnv.WRANGLER_CACHE_DIR
  process.env.WRANGLER_LOG_PATH = wranglerEnv.WRANGLER_LOG_PATH
  process.env.WRANGLER_REGISTRY_PATH = wranglerEnv.WRANGLER_REGISTRY_PATH
  ensureWranglerRuntimeDirs(runtimePaths)
  await rm(join(runtimePaths.persistTo, 'state/v3/cache'), {
    recursive: true,
    force: true,
  })

  await Promise.all([
    seedPlaywrightTestData(),
    // Disable rate limiting so Playwright tests don't get 429s during repeated interactions
    routeRateLimitConfig
      .waitForInitialization()
      .then(() => routeRateLimitConfig.setField('enabled', false)),
  ])
  await assertPlaywrightSeedData()
  // Flush any rate limit counts accumulated during backend startup (before the disable took effect)
  await Promise.all(Object.values(routeRateLimiters).map(rl => rl.invalidate()))
  await Promise.all([
    invalidate.topic_metrics(...PLAYWRIGHT_TOPIC_IDS),
    invalidateAnonymousSearchCaches(),
  ])
}
