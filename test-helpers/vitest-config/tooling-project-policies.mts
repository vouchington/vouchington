type ToolingProjectPolicy = {
  environmentPolicy: 'isolated' | 'worktree-db'
  runInLocalCoverage: boolean
  runInToolingTest: boolean
  runInToolingWorkflow: boolean
}

export const isolatedSetupFile = './test-helpers/vitest.setup.tooling-isolated-env.mts'
export const worktreeDbSetupFile = './test-helpers/vitest.setup.tooling-worktree-env.mts'

export const toolingProjectPolicies = {
  'dev-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'static-analysis-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'static-analysis-ast-grep': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'ci-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'github-actions': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'git-hooks': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'playwright-helpers': {
    environmentPolicy: 'worktree-db',
    runInLocalCoverage: false,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'backend-docs-freshness': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'i18n-extract-codemod': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
  'docker-deploy': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
  },
} as const satisfies Record<string, ToolingProjectPolicy>

export type ToolingProjectName = keyof typeof toolingProjectPolicies
