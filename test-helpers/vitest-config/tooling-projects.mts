import type { TestProjectConfiguration } from 'vitest/config'
import { isolatedSetupFile, worktreeDbSetupFile } from './tooling-project-policies.mts'

export const toolingTestBudget = {
  // Child-process fixtures retain bounded cleanup within the standard project budget.
  hookTimeout: 5_000,
  isolate: true,
  testTimeout: 5_000,
}

const defaultExcludes = ['**/node_modules/**', '**/.git/**']

export const toolingProjects = [
  {
    extends: true,
    test: {
      ...toolingTestBudget,
      name: 'dev-tools',
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: [
        'static-code-analysis/repo-file-policy-worker-client.test.mts',
        'static-code-analysis/helper-file-names.test.mts',
        'static-code-analysis/__tests__/run-node-checks.test.mts',
        'static-code-analysis/__tests__/run-node-checks.mock.test.mts',
        'static-code-analysis/__tests__/scc-complexity.test.mts',
        'static-code-analysis/__tests__/tooling-dependency-cruiser.test.mts',
        'static-code-analysis/config-inventory/**/*.test.mts',
        'static-code-analysis/dependency-license-policy/**/*.test.mts',
        'static-code-analysis/jscpd/**/*.test.mts',
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: [
        'static-code-analysis/__tests__/backend-contract-program-construction-location-parity.test.mts',
        'static-code-analysis/__tests__/ast-grep-tsx-parity.test.mts',
        'static-code-analysis/__tests__/ast-grep-backend-manifests.test.mts',
        'static-code-analysis/__tests__/no-inline-noop-promise-catch-oxlint.test.mts',
        'static-code-analysis/__tests__/no-explicit-any-oxlint.test.mts',
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      // Hook contracts use tiny local Git fixtures; longer cases need an explicit bounded override.
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: ['playwright/helpers/**/*.test.mts'],
      exclude: defaultExcludes,
      setupFiles: [worktreeDbSetupFile],
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
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
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: [
        'static-code-analysis/docker-deploy/dockerfile-runtime-cmd.test.mts',
        'static-code-analysis/docker-deploy/dockerfile-prewarm-ports.test.mts',
        'static-code-analysis/docker-deploy/__tests__/normalize-deployed-layer.test.mts',
        'static-code-analysis/docker-deploy/__tests__/prune-deployed-runtime-deps.test.mts',
        'static-code-analysis/docker-deploy/__tests__/prune-opentelemetry-alternate-builds.test.mts',
        'static-code-analysis/docker-deploy/__tests__/restore-deployed-workspace-packages*.test.mts',
        'backend/dependency-cruiser-rules/__tests__/*.test.mts',
      ],
      exclude: defaultExcludes,
      setupFiles: [isolatedSetupFile],
    },
  },
] satisfies TestProjectConfiguration[]
