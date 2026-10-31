import type { TestProjectConfiguration } from 'vitest/config'
import { backendNoDataUnitTestFiles } from './backend-no-data-unit-tests.mts'

const backendDataStoreTestDefaults = {
  pool: 'forks' as const,
  isolate: false,
  env: { PG_TEST_STATEMENT_TIMEOUT_MS: process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '2000' }, // Leave SQL attribution and cleanup headroom inside the project deadline.
  globalSetup: './test-helpers/vitest.setup.data-stores.mts',
  setupFiles: [
    // Sentry must precede glide workers' on-error preload; setup resets every isolate:false file (a test import only registers in the first cached worker file).
    './backend/test-helpers/vitest.setup.sentry-mock.mts',
    './test-helpers/vitest.setup.request-query-timing.mts',
    './test-helpers/vitest.setup.shared-db-scope-guard.mts',
    './test-helpers/vitest.setup.psql-pool-metrics.mts',
    './test-helpers/vitest.setup.dynamic-config-isolation.mts',
    './test-helpers/vitest.setup.glide-mq-workers.mts',
    './backend/test-helpers/vitest.setup.aws-mocks.mts',
    './backend/test-helpers/vitest.setup.s3-offline.mts',
    './backend/test-helpers/vitest.setup.captcha-skip.mts',
    './backend/test-helpers/vitest.setup.server-error-responses.mts',
    './backend/test-helpers/vitest.setup.request-query-profile.mts',
    './test-helpers/vitest.setup.fork-leak-detection.mts',
  ],
  testTimeout: 5_000,
  hookTimeout: 5_000,
}

const backendMocksProject = {
  extends: true,
  test: {
    pool: 'forks',
    isolate: true,
    name: 'backend-mocks',
    env: { PG_TEST_STATEMENT_TIMEOUT_MS: '2000' },
    runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
    include: [
      'backend/{agents,api,modules,data-stores,entrypoints,queues,scripts,services,sitemaps,mcp,worker-runtime,workers}/**/*.mock.test.mts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/*.no-data.mock.test.mts',
      '**/*.real-glide.mock.test.mts',
      'backend/data-stores/psql/migrate.mock.test.mts',
      'backend/api/v1/images/__tests__/index.real-presigner.s3.mock.test.mts', // Real S3 presigner; collected by the credentialed backend-aws project.
    ],
    globalSetup: './test-helpers/vitest.setup.data-stores.mts',
    setupFiles: [
      './backend/test-helpers/vitest.setup.sentry-mock.mts', // Must precede glide workers, which preload on-error and bind the SDK.
      './test-helpers/vitest.setup.request-query-timing.mts',
      './test-helpers/vitest.setup.shared-db-scope-guard.mts',
      './test-helpers/vitest.setup.psql-pool-metrics.mts',
      './test-helpers/vitest.setup.dynamic-config-isolation.mts',
      './test-helpers/vitest.setup.glide-mq-workers.mts',
      './backend/test-helpers/vitest.setup.aws-mocks.mts',
      './backend/test-helpers/vitest.setup.server-error-responses.mts',
      './backend/test-helpers/vitest.setup.request-query-profile.mts',
    ],
    testTimeout: 5_000,
    hookTimeout: 5_000,
  },
} satisfies TestProjectConfiguration

export const backendDataProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-data-stores',
      runner: './test-helpers/vitest.runner.backend-data-guards.mts',
      include: [
        'backend/{agents,api,data-stores,entrypoints,md,queues,rss,scripts,service-registrations,services,sitemaps,mcp,worker-runtime,workers}/**/*.test.mts',
        'backend/test-helpers/election-vote-stats.test.mts',
        'backend/test-helpers/psql-pool-metrics.test.mts',
        'backend/test-helpers/post-search-query-syntax.test.mts',
        'backend/test-helpers/dynamic-config.test.mts',
        'backend/test-helpers/services/posts/test-support.test.mts',
        'backend/test-helpers/services/users/test-support.test.mts',
        'backend/test-helpers/workers/entity-listeners/test-support.test.mts',
        'backend/test-helpers/entities/bluesky-link-authorizations.test.mts',
        'backend/test-helpers/playwright-seed-assertions.test.mts',
        'backend/test-helpers/playwright-seed-rows.test.mts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.mock.test.mts',
        '**/*.real-glide.test.mts',
        ...backendNoDataUnitTestFiles,
        '**/*.eval.test.mts',
        '**/*.anthropic*.test.mts',
        '**/*.openai*.test.mts',
        '**/*.openrouter.test.mts',
        '**/*.bedrock.test.mts',
        '**/*.s3.test.mts',
        '**/*.stripe.test.mts',
        'backend/services/browser-crawl/crawl.integration.test.mts',
        'backend/data-stores/analytics/**/*.test.mts',
        'backend/services/analytics/**/*.test.mts',
        'backend/services/crawler-rss/index.redirect.test.mts',
        'backend/services/landing-page-analytics/record-visit.test.mts',
        'backend/services/landing-page-analytics/record-click.test.mts',
        'backend/services/landing-page-analytics/get-analytics.test.mts',
        'backend/services/jwt-session/create.test.mts',
        'backend/services/jwt-session/flows.test.mts',
        'backend/data-stores/psql/__tests__/schema-*.test.mts',
        'backend/data-stores/psql/__tests__/lifecycle-integrity.test.mts',
        'backend/api/v1/platform-stats/platform-stats.test.mts',
        'backend/services/ai-usage/__tests__/record-monthly-partition.test.mts',
        'backend/services/data-retention/cleanup-ai-usage*.test.mts',
      ],
    },
  },
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-ai-usage-monthly-ddl',
      sequence: { groupOrder: 1 },
      isolate: true,
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      include: [
        'backend/services/ai-usage/__tests__/record-monthly-partition.test.mts',
        'backend/services/data-retention/cleanup-ai-usage*.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-platform-stats-cache',
      testTimeout: 5_000,
      hookTimeout: 5_000,
      env: { ...backendDataStoreTestDefaults.env, PG_TEST_STATEMENT_TIMEOUT_MS: '2000' },
      isolate: true,
      runner: './test-helpers/vitest.runner.platform-stats-cache.mts',
      include: ['backend/api/v1/platform-stats/platform-stats.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      globalSetup: backendDataStoreTestDefaults.globalSetup,
      setupFiles: backendDataStoreTestDefaults.setupFiles,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend-postgres-schema',
      include: [
        'backend/data-stores/psql/__tests__/schema-*.test.mts',
        'backend/data-stores/psql/__tests__/lifecycle-integrity.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: ['./test-helpers/vitest.setup.stored-secret-encryption-keys.mts'],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  backendMocksProject,
  {
    ...backendMocksProject,
    test: {
      ...backendMocksProject.test,
      name: 'backend-migration-initializers',
      sequence: { setupFiles: 'list' },
      include: ['backend/data-stores/psql/migrate.mock.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: [
        './backend/test-helpers/vitest.setup.migration-initializers.mts',
        ...backendMocksProject.test.setupFiles,
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
]
