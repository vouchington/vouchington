import type { TestProjectConfiguration } from 'vitest/config'

export const backendDataStoreTestDefaults = {
  pool: 'forks' as const,
  isolate: false,
  // These existing 30s data suites include real plan and lock-boundary queries. The
  // five-second projects retain the default 2s SQL budget.
  env: { PG_TEST_STATEMENT_TIMEOUT_MS: process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '20000' },
  globalSetup: './test-helpers/vitest.setup.data-stores.mts',
  setupFiles: [
    // Must run before glide-mq-workers: that setup preloads workers that transitively
    // import @modules/on-error → @sentry/node, so the Sentry mock has to be registered
    // first and its per-test reset must be registered for every file sharing the worker.
    './backend/test-helpers/vitest.setup.sentry-mock.mts',
    './test-helpers/vitest.setup.shared-db-scope-guard.mts',
    './test-helpers/vitest.setup.dynamic-config-isolation.mts',
    './test-helpers/vitest.setup.worker-query-profiles.mts',
    './test-helpers/vitest.setup.glide-mq-workers.mts',
    './backend/test-helpers/vitest.setup.aws-mocks.mts',
    './backend/test-helpers/vitest.setup.s3-offline.mts',
    './backend/test-helpers/vitest.setup.captcha-skip.mts',
    './backend/test-helpers/vitest.setup.server-error-responses.mts',
    './backend/test-helpers/vitest.setup.request-query-profile.mts',
    './test-helpers/vitest.setup.fork-leak-detection.mts',
  ],
  testTimeout: 30_000,
  hookTimeout: 30_000,
} satisfies TestProjectConfiguration['test']
