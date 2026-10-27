import type { TestProjectConfiguration } from 'vitest/config'

// The eval Vitest projects: model-quality regression sets that call a live provider once per
// fixture, run only by `.github/workflows/evals-backend.yml` on `workflow_dispatch`. They are
// deliberately not part of `backendCredentialedTestProjects`: that list is what the credentialed
// pull-request and nightly job runs, and an eval there would spend a provider call per fixture on
// every run. The file shape is `*.<provider>.eval.test.mts`; the credentialed, unit, and data-store
// projects exclude `*.eval.test.mts`, so each eval file has exactly one owner.
//
// Each project mirrors the setup of the credentialed project for the same provider. Keep each
// `include` a literal string array so no-mistakes can read it statically (see
// docs/development/reference-explain-test-selection-and-vitest-ownership.md).
export const backendEvalTestProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-evals-openrouter',
      env: { PG_TEST_STATEMENT_TIMEOUT_MS: process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '2000' },
      include: ['backend/**/*.openrouter.eval.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: ['./test-helpers/vitest.setup.postgres-sessions.mts'],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-evals-anthropic',
      env: { PG_TEST_STATEMENT_TIMEOUT_MS: process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '2000' },
      include: ['backend/**/*.anthropic.eval.test.mts'],
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      exclude: ['**/node_modules/**', '**/.git/**'],
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      setupFiles: [
        './test-helpers/vitest.setup.request-query-timing.mts',
        './test-helpers/vitest.setup.shared-db-scope-guard.mts',
        './test-helpers/vitest.setup.psql-pool-metrics.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
        './test-helpers/vitest.setup.fork-leak-detection.mts',
      ],
      testTimeout: 5_000,
      hookTimeout: 5_000,
    },
  },
]
