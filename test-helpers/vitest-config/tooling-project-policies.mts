type ToolingProjectPolicy = {
  environmentPolicy: 'isolated' | 'worktree-db'
  runInLocalCoverage: boolean
  runInToolingTest: boolean
  runInToolingWorkflow: boolean
  runInDedicatedToolingWorkflow: boolean
}

export const isolatedSetupFile = './test-helpers/vitest.setup.tooling-isolated-env.mts'
export const worktreeDbSetupFile = './test-helpers/vitest.setup.tooling-worktree-env.mts'

export const toolingProjectPolicies = {
  'dev-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'static-analysis-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'static-analysis-ast-grep': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'ci-tools': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'github-actions': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'git-hooks': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'playwright-helpers': {
    environmentPolicy: 'worktree-db',
    runInLocalCoverage: false,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'backend-docs-freshness': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'i18n-extract-codemod': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'i18n-route-bounds': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: false,
    runInDedicatedToolingWorkflow: true,
  },
  'docker-deploy': {
    environmentPolicy: 'isolated',
    runInLocalCoverage: true,
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
} as const satisfies Record<string, ToolingProjectPolicy>

export type ToolingProjectName = keyof typeof toolingProjectPolicies
