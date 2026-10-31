import react from '@vitejs/plugin-react'
import type { TestProjectConfiguration } from 'vitest/config'
import { backendNoDataUnitTestFiles } from './backend-no-data-unit-tests.mts'

export const backendCoreProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'ts-shared',
      include: ['ts-shared/**/*.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-modules',
      include: ['backend/modules/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.mock.test.mts',
        ...backendNoDataUnitTestFiles,
        '**/*.anthropic*.test.mts',
        '**/*.openrouter.test.mts',
        '**/*.stripe.test.mts',
        'backend/modules/aws/s3.test.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-test-helpers',
      include: ['backend/test-helpers/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
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
        // Canonical contract assertions read checked-in artifacts validated by static-backend.
        'backend/test-helpers/api-fixtures/native-moderation-optional-contracts.test.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      // These tests consume checked-in contracts; PostgreSQL compilation belongs to static-backend.
      isolate: false,
      name: 'backend-contract-artifacts',
      include: ['backend/test-helpers/api-fixtures/native-moderation-optional-contracts.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend-no-data-mocks',
      include: [
        'backend/config/**/*.test.mts',
        'backend/**/*.no-data.mock.test.mts',
        ...backendNoDataUnitTestFiles,
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: [
        './backend/test-helpers/vitest.setup.sentry-mock.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    plugins: [react()],
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-email-templates',
      include: ['email-templates/**/*.test.{tsx,mts}'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      environment: 'node',
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend/data-stores/analytics',
      include: ['backend/data-stores/analytics/**/*.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**', '**/*.mock.test.mts'],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend/services/analytics',
      include: [
        'backend/services/analytics/**/*.test.mts',
        'backend/services/crawler-rss/index.redirect.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**', '**/*.mock.test.mts'],
      setupFiles: [
        './backend/test-helpers/vitest.setup.analytics-local-env.mts',
        './backend/test-helpers/vitest.setup.valkey-logger.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend/analytics-integration',
      env: { PG_TEST_STATEMENT_TIMEOUT_MS: '2000' },
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      include: [
        'backend/services/jwt-session/create.test.mts',
        'backend/services/jwt-session/flows.test.mts',
        'backend/services/landing-page-analytics/record-visit.test.mts',
        'backend/services/landing-page-analytics/record-click.test.mts',
        'backend/services/landing-page-analytics/get-analytics.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**', '**/*.mock.test.mts'],
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      setupFiles: [
        './test-helpers/vitest.setup.request-query-timing.mts',
        './test-helpers/vitest.setup.shared-db-scope-guard.mts',
        './test-helpers/vitest.setup.psql-pool-metrics.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
]
