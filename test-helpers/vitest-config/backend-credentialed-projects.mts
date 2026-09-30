import type { TestProjectConfiguration } from 'vitest/config'

// The credentialed Vitest projects: the ones that probe a real external provider with live
// credentials, run by `.github/workflows/tests-backend-credentialed.yml`. `vitest.config.mts`
// spreads them into its `projects`, and the transient-retry classifier
// (`ci/transient-retry/backend-credentialed-log-fingerprints.mts`) derives its `FAIL <project>
// <path>` matcher and Vitest command markers from the same objects, so the classifier's boundary
// cannot drift from what Vitest actually runs. The classifier must not import `vitest.config.mts`
// itself: that pulls in DB/Valkey alias resolution and `vitest`, which a Node-run CI script stays
// free of. This module holds only literals plus a type-only import (erased under Node type
// stripping).
//
// Keep each `include` a literal string array: no-mistakes selects tests by reading these arrays
// statically and rejects any other expression (see
// docs/development/reference-explain-test-selection-and-vitest-ownership.md).
export const backendCredentialedTestProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-openrouter',
      include: ['backend/**/*.openrouter.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-aws',
      include: [
        'backend/**/*.s3.test.mts',
        'backend/modules/aws/s3.test.mts',
        'backend/modules/aws/ses.generated.test.mts',
      ],
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      exclude: ['**/node_modules/**', '**/.git/**'],
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      setupFiles: [
        './test-helpers/vitest.setup.shared-db-scope-guard.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './test-helpers/vitest.setup.fork-leak-detection.mts',
      ],
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-openai',
      include: ['backend/**/*.openai*.test.mts'],
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      exclude: ['**/node_modules/**', '**/.git/**'],
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      setupFiles: [
        './test-helpers/vitest.setup.shared-db-scope-guard.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
        './test-helpers/vitest.setup.fork-leak-detection.mts',
      ],
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-bedrock',
      include: ['backend/**/*.bedrock.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: false,
      name: 'backend-stripe',
      include: ['backend/**/*.stripe.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]
