import { defineConfig } from 'vitest/config'
import { ciOutputFile, ciReporters } from './test-helpers/vitest-ci-reporters.mts'
import { backendAliases, realGlideMqAlias } from './test-helpers/vitest-config/aliases.mts'
import { backendCoreProjects } from './test-helpers/vitest-config/backend-core-projects.mts'
import {
  backendDataProjects,
  forkCrashReportExecArgv,
} from './test-helpers/vitest-config/backend-data-projects.mts'
import {
  coverageConfig,
  parseVitestMaxWorkers,
  storybookBrowserConnectionTimeoutMs,
  vitestFsModuleCachePath,
  vitestViteCacheDir,
} from './test-helpers/vitest-config/environment.mts'
import { toolingProjects } from './test-helpers/vitest-config/tooling-projects.mts'
import { webProjects } from './test-helpers/vitest-config/web-projects.mts'

const reporters = ciReporters()
const outputFile = ciOutputFile()

export default defineConfig({
  cacheDir: vitestViteCacheDir,
  resolve: {
    alias: backendAliases(),
  },
  test: {
    globals: false,
    environment: 'node',
    pool: 'threads',
    // DB-backed projects run in parallel with randomized ownership-scoped fixtures. Exact global
    // aggregate assertions must reserve and clean an owned window; random IDs alone do not isolate
    // shared totals. Throttle concurrency through the workflow-owned VITEST_MAX_WORKERS policy,
    // not here —
    // and never via a project-level `maxWorkers` literal: VITEST_MAX_WORKERS unconditionally
    // overwrites any per-project value during vitest's config resolution, so a literal is both
    // banned (see dev/vitest-config.test.mts) and non-functional whenever the env var is set.
    fileParallelism: true,
    maxWorkers: parseVitestMaxWorkers(process.env.VITEST_MAX_WORKERS),
    // Persist transformed modules across local `vitest run` processes. Path stays under the
    // workspace `.cache/vite/` tree — not the default `node_modules/.vitest-cache`, which
    // `./dev/reset` deletes. Browser Mode ignores this option. CI does not restore it through
    // `actions/cache` (the cache policy permits only the pnpm store and Playwright browsers).
    fsModuleCache: true,
    fsModuleCachePath: vitestFsModuleCachePath,
    // Root-level only (not per-project): bounds the whole close sequence after tests
    // complete — globalSetup teardown() plus pool/worker close — across every pool type.
    // Backend forks-pool projects run globalSetup teardown in the main process to close
    // Valkey/PSQL/glide-mq sockets gracefully; that graceful close is also the only
    // socket-leak tripwire (a leaked handle prevents a clean exit). This headroom lets
    // that close finish under CPU contention instead of being force-killed
    // mid-teardown — which the forks pool then misreports as "Worker exited unexpectedly".
    // A genuine leak still exceeds this and gets force-killed; see the
    // [vitest-teardown]/[vitest-teardown-overrun] diagnostics for what was in flight.
    teardownTimeout: 20_000,
    // Backstop only — every project below must also declare its own explicit testTimeout/
    // hookTimeout (enforced by dev/vitest-config.test.mts). Without an explicit per-project
    // value, a project silently falls back to Vitest's built-in 5000/10000 defaults, which is
    // how ts-shared broke `main` twice (#10762). This root value exists so a project added
    // between edits, or run ad hoc, never regresses to that silent default while the
    // per-project assertion is temporarily unsatisfied.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Stop early on widespread failure instead of running every remaining test.
    bail: 10,
    // Vitest 4.1's BrowserSessions reads this root-level value through
    // project.vitest.config rather than the selected project's browser config.
    browser: { connectTimeout: storybookBrowserConnectionTimeoutMs },
    // Root-level so it applies to every project (setupFiles merge additively under
    // `extends: true`, they are never replaced) — a test that leaves fake timers installed
    // corrupts state shared with later tests regardless of pool/isolate settings. Must stay a
    // literal relative path (no `resolve(process.cwd(), ...)`) so `no-mistakes` can trace this
    // as a static `vitest-setup` dependency edge instead of falling back to a global full-suite
    // selection. Vitest resolves setupFiles per-project against that project's own `root:`;
    // web-storybook-browser overrides `root: 'web'` (see storybook-browser-project.mts), so this
    // same literal resolves there to web/test-helpers/vitest.setup.fake-timer-guard.mts — a
    // redirect shim that re-imports this file for its side effects. See that shim's comment and
    // docs/development/ci.md for why the indirection exists.
    setupFiles: ['./test-helpers/vitest.setup.fake-timer-guard.mts'],
    coverage: coverageConfig(),
    ...(reporters ? { reporters } : {}),
    ...(outputFile ? { outputFile } : {}),
    projects: [
      ...backendCoreProjects,
      ...backendDataProjects,
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
          exclude: ['**/node_modules/**', '**/.git/**'],
          globalSetup: './test-helpers/vitest.setup.data-stores.mts',
          setupFiles: [
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
          exclude: ['**/node_modules/**', '**/.git/**'],
          globalSetup: './test-helpers/vitest.setup.data-stores.mts',
          setupFiles: [
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
      {
        extends: true,
        resolve: {
          alias: [realGlideMqAlias(), ...backendAliases({ useGlideMqShim: false })],
        },
        test: {
          pool: 'forks',
          isolate: true,
          name: 'backend-real-glide-mq',
          include: ['backend/**/*.real-glide.mock.test.mts'],
          exclude: ['**/node_modules/**', '**/.git/**'],
          setupFiles: ['./test-helpers/vitest.setup.fork-exit-sentinel.mts'],
          execArgv: forkCrashReportExecArgv,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      ...toolingProjects,
      ...webProjects,
    ],
  },
})
