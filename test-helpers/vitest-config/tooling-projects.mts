import type { TestProjectConfiguration } from 'vitest/config'
import { isolatedSetupFile, worktreeDbSetupFile } from './tooling-project-policies.mts'

export const toolingTestBudget = {
  // Child-process-heavy tests are timeout-sensitive under self-hosted runner CPU contention.
  // Run at the root's parallel maxWorkers, but keep generous 30s test/hook budgets so
  // slow child-process spawns and coverage reporting can still finish cleanly.
  //
  // Do not raise these project-level budgets for a single slow file (dev/vitest-config.test.mts's
  // "Vitest timeout policy (#10762, #8078)" ceiling test hard-caps every project's testTimeout at
  // 60s and hookTimeout at 90s, and its own comment says a genuinely slower test belongs a
  // targeted per-test override, not a bump to these ceilings). ci/coverage-rules-scope.test.mts's
  // two whole-repo-scanning tests use exactly that per-test override — see the inline timeout
  // arguments there.
  hookTimeout: 30_000,
  isolate: true,
  testTimeout: 30_000,
}

const defaultExcludes = ['**/node_modules/**', '**/.git/**']

export const toolingProjects = [
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'dev-tools',
      include: ['dev/**/*.test.mts', '.pr-shepherd/**/*.test.mts', '.agents/catalog/**/*.test.mts'],
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
        'static-code-analysis/dependency-license-policy/**/*.test.mts',
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
