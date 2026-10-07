import react from '@vitejs/plugin-react'
import type { TestProjectConfiguration } from 'vitest/config'

// Dependency-injected unit tests need neither database bootstrap nor module mocking.
export const backendNoDataUnitTestFiles = [
  'backend/entrypoints/api/startup.test.mts',
  'backend/entrypoints/worker-cpu/grafana-heartbeat.test.mts',
  'backend/data-stores/graceful-shutdown/index.test.mts',
]

export const backendCoreProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'ts-shared',
      include: ['ts-shared/**/*.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 15_000,
      hookTimeout: 30_000,
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
        '**/*.openrouter.test.mts',
        '**/*.stripe.test.mts',
        'backend/modules/aws/s3.test.mts',
        'backend/modules/aws/ses.generated.test.mts',
      ],
      testTimeout: 15_000,
      hookTimeout: 30_000,
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
        'backend/test-helpers/services/posts/test-support.test.mts',
        'backend/test-helpers/services/users/test-support.test.mts',
        'backend/test-helpers/workers/entity-listeners/test-support.test.mts',
        'backend/test-helpers/entities/bluesky-link-authorizations.test.mts',
        // Canonical contract assertions read checked-in artifacts validated by static-backend.
        'backend/test-helpers/api-fixtures/native-moderation-optional-contracts.test.mts',
      ],
      testTimeout: 15_000,
      hookTimeout: 30_000,
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
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend-no-data-mocks',
      include: ['backend/**/*.no-data.mock.test.mts', ...backendNoDataUnitTestFiles],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: [
        './backend/test-helpers/vitest.setup.sentry-mock.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
      testTimeout: 15_000,
      hookTimeout: 15_000,
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
      testTimeout: 15_000,
      hookTimeout: 30_000,
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
      testTimeout: 15_000,
      hookTimeout: 30_000,
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
      testTimeout: 15_000,
      hookTimeout: 30_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend/analytics-integration',
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
        './test-helpers/vitest.setup.shared-db-scope-guard.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]
