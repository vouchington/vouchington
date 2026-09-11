import type { TestProjectConfiguration } from 'vitest/config'

// Node diagnostic reports for a fork's fatal V8/native errors — the leg that separates heap
// exhaustion (populated javascriptHeap, header.trigger fatal-error) from a native/NAPI fatal
// error (populated nativeStack). init-forks.js only special-cases --prof/--cpu-prof/--heap-prof/
// --diagnostic-dir, so these --report-* flags pass through to each fork untouched. CI-gated:
// these reports are large and local runs already have a live terminal to inspect on failure.
// Exported for vitest.config.mts's inline backend-real-glide-mq project and
// backend-core-projects.mts's backend-contract-program project — the other projects outside this
// file that need the same fork diagnostics — kept as one CI-gate definition rather than duplicating
// it.
const forkDiagnosticReportDirectory =
  process.env.VITEST_FORK_DIAGNOSTIC_DIR ?? '.vitest-reports/fork-diagnostics'
export const forkCrashReportExecArgv = process.env.CI
  ? [
      '--report-on-fatalerror',
      '--report-uncaught-exception',
      '--report-compact',
      `--report-directory=${forkDiagnosticReportDirectory}`,
    ]
  : []

const backendDataStoreTestDefaults = {
  pool: 'forks' as const,
  isolate: false,
  globalSetup: './test-helpers/vitest.setup.data-stores.mts',
  setupFiles: [
    // Must run before glide-mq-workers: that setup preloads workers that transitively
    // import @modules/on-error → @sentry/node, so the Sentry mock has to be registered
    // first or the real SDK singleton gets bound during preload and tests can't intercept it.
    // Registering it here (rather than relying on individual test files to import it) also
    // guarantees the mock's per-test beforeEach reset runs for every file in this project —
    // under isolate:false, a file that only imports the module gets the reset registered
    // solely if it's the first file in its worker to do so, since the module body doesn't
    // re-run for later files sharing the cached module graph.
    './backend/test-helpers/vitest.setup.sentry-mock.mts',
    './test-helpers/vitest.setup.dynamic-config-isolation.mts',
    './test-helpers/vitest.setup.glide-mq-workers.mts',
    './backend/test-helpers/vitest.setup.aws-mocks.mts',
    './backend/test-helpers/vitest.setup.captcha-skip.mts',
    './test-helpers/vitest.setup.fork-leak-detection.mts',
    './test-helpers/vitest.setup.fork-exit-sentinel.mts',
  ],
  execArgv: forkCrashReportExecArgv,
  testTimeout: 30_000,
  hookTimeout: 30_000,
}

export const backendDataProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-data-stores',
      runner: './test-helpers/vitest.runner.glide-mq-worker-attachment-guard.mts',
      include: [
        'backend/{agents,api,data-stores,entrypoints,flows,md,queues,rss,scripts,service-registrations,services,sitemaps,tools,worker-runtime,workers}/**/*.test.mts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.mock.test.mts',
        '**/*.openai*.test.mts',
        '**/*.bedrock.test.mts',
        '**/*.s3.test.mts',
        '**/*.stripe.test.mts',
        'backend/tools/registry.docs.test.mts',
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
        'backend/api/activitypub/inbox-capacity.test.mts',
        'backend/services/ap-inbox-activities/activitypub-inbox-capacity.test.mts',
      ],
    },
  },
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-activitypub-capacity',
      include: [
        'backend/api/activitypub/inbox-capacity.test.mts',
        'backend/services/ap-inbox-activities/activitypub-inbox-capacity.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
      isolate: false,
      testTimeout: 60_000,
      hookTimeout: 60_000,
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
      setupFiles: ['./test-helpers/vitest.setup.fork-exit-sentinel.mts'],
      execArgv: forkCrashReportExecArgv,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
  {
    extends: true,
    test: {
      pool: 'forks',
      isolate: true,
      name: 'backend-mocks',
      include: [
        'backend/{agents,api,modules,data-stores,entrypoints,flows,queues,scripts,services,sitemaps,tools,worker-runtime,workers}/**/*.mock.test.mts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.no-data.mock.test.mts',
        '**/*.real-glide.mock.test.mts',
      ],
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      setupFiles: [
        // Must run before glide-mq-workers: that setup preloads workers that transitively
        // import @modules/on-error → @sentry/node, so the Sentry mock has to be registered
        // first or the real SDK singleton gets bound during preload and tests can't intercept it.
        './backend/test-helpers/vitest.setup.sentry-mock.mts',
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
        './test-helpers/vitest.setup.fork-exit-sentinel.mts',
      ],
      execArgv: forkCrashReportExecArgv,
      testTimeout: 15_000,
      hookTimeout: 15_000,
    },
  },
]
