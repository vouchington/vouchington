import type { TestProjectConfiguration } from 'vitest/config'
import { isolatedSetupFile, worktreeDbSetupFile } from './tooling-project-policies.mts'

const toolingTestBudget = {
  // Child-process-heavy tests are timeout-sensitive under runner CPU contention. Run at the
  // root's parallel maxWorkers, but keep generous test/hook budgets so slow child-process spawns
  // and coverage reporting can still finish cleanly. 120s (previously 30s) reflects GitHub-hosted
  // ubuntu-latest's 2-vCPU ceiling: coverage-rules-scope's suite was observed with a 63.6s single
  // slowest case and a 124.4s overall Duration on GitHub-hosted runners, versus 72.05s (whole
  // suite) self-hosted, so 30s was no longer enough headroom even before accounting for
  // run-to-run variance. 120s keeps comfortable margin under the "Run tooling tests" step's
  // 8-minute (480s) ceiling even if two hooks or tests in the same file both approach the new
  // ceiling back to back.
  hookTimeout: 120_000,
  isolate: true,
  testTimeout: 120_000,
}

const defaultExcludes = ['**/node_modules/**', '**/.git/**']

export const toolingProjects = [
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'dev-tools',
      include: ['dev/**/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'static-analysis-tools',
      include: [
        'static-code-analysis/repo-file-policy-worker-client.test.mts',
        'static-code-analysis/__tests__/run-node-checks.test.mts',
        'static-code-analysis/__tests__/run-node-checks.mock.test.mts',
        'static-code-analysis/__tests__/scc-complexity.test.mts',
        'static-code-analysis/__tests__/tooling-dependency-cruiser.test.mts',
        'static-code-analysis/config-inventory/**/*.test.mts',
        'static-code-analysis/oxlint-plugin/**/*.test.mts',
        'static-code-analysis/repo-file-policy/**/*.test.mts',
        'static-code-analysis/targeted-guardrails/**/*.test.mts',
      ],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'static-analysis-ast-grep',
      include: [
        'static-code-analysis/__tests__/backend-contract-program-construction-location-parity.test.mts',
        'static-code-analysis/__tests__/ast-grep-tsx-parity.test.mts',
        'static-code-analysis/__tests__/no-inline-noop-promise-catch-oxlint.test.mts',
        'static-code-analysis/__tests__/ssrf-guard-import-options-oxlint.test.mts',
      ],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'ci-tools',
      include: ['ci/**/*.test.mts', 'test-helpers/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'github-actions',
      include: ['.github/{actions,workflows}/**/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'git-hooks',
      include: ['.husky/**/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'playwright-helpers',
      include: ['playwright/helpers/**/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [worktreeDbSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      pool: 'forks',
      isolate: false,
      name: 'backend-docs-freshness',
      include: ['backend/tools/registry.docs.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      // no-mistakes analyzeProject / invocation.lock cannot be SIGKILLed on the
      // tooling threads pool (#11686); keep isolate: true from toolingTestBudget.
      pool: 'forks',
      name: 'i18n-extract-codemod',
      include: ['static-code-analysis/i18n-extract/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        'static-code-analysis/i18n-extract/route-bounds.test.mts',
      ],
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'i18n-route-bounds',
      include: ['static-code-analysis/i18n-extract/route-bounds.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'docker-deploy',
      include: [
        'static-code-analysis/docker-deploy/dockerfile-runtime-cmd.test.mts',
        'static-code-analysis/docker-deploy/dockerfile-prewarm-ports.test.mts',
        'static-code-analysis/docker-deploy/__tests__/normalize-deployed-layer.test.mts',
        'static-code-analysis/docker-deploy/__tests__/prune-deployed-runtime-deps.test.mts',
        'static-code-analysis/docker-deploy/__tests__/restore-deployed-workspace-packages*.test.mts',
        'backend/dependency-cruiser-rules/__tests__/*.test.mts',
      ],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
] satisfies TestProjectConfiguration[]
