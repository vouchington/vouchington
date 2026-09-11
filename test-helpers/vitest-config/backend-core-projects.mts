import react from '@vitejs/plugin-react'
import type { TestProjectConfiguration } from 'vitest/config'

import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from '../../backend/test-helpers/api-fixtures/cold-build-budget.mts'
import { forkCrashReportExecArgv } from './backend-data-projects.mts'

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
        // Moved to the dedicated backend-contract-program project below: these four files build the
        // real backend contract ts.Program, and sharing this fork with the rest of this project's
        // files makes this project's peak heap a function of whichever unrelated files' retained
        // heap happens to accumulate here first. See backend-contract-program's own comment.
        'backend/test-helpers/api-fixtures/backend-program.test.mts',
        'backend/test-helpers/api-fixtures/openapi/write-openapi.test.mts',
        'backend/test-helpers/api-fixtures/query-contract-registry.hardening.test.mts',
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
      // isolate: false among just these four files: none of them need a per-file module-registry
      // reset, and when two do land in the same fork they reuse one memoized backend ts.Program via
      // loadBackendProgram() (see backend-program.mts) instead of each building their own. It does
      // NOT guarantee all four share one fork — Vitest 5 has no per-project worker cap that survives
      // VITEST_MAX_WORKERS (CI's env-var worker-count override unconditionally overwrites any
      // project-level maxWorkers/fileParallelism value during config resolution), so each file can
      // still land on its own fork. That's fine: what this project boundary actually buys is that no
      // fork here pays for a program build *plus* whatever unrelated backend-test-helpers files would
      // otherwise have accumulated in it — see the exclude comment there.
      isolate: false,
      name: 'backend-contract-program',
      include: [
        'backend/test-helpers/api-fixtures/backend-program.test.mts',
        'backend/test-helpers/api-fixtures/openapi/write-openapi.test.mts',
        'backend/test-helpers/api-fixtures/query-contract-registry.hardening.test.mts',
        'backend/test-helpers/api-fixtures/native-moderation-optional-contracts.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
      setupFiles: ['./test-helpers/vitest.setup.fork-exit-sentinel.mts'],
      execArgv: forkCrashReportExecArgv,
      testTimeout: COLD_BACKEND_PROGRAM_TIMEOUT_MS,
      hookTimeout: COLD_BACKEND_PROGRAM_TIMEOUT_MS,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend-no-data-mocks',
      include: ['backend/**/*.no-data.mock.test.mts'],
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
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]
