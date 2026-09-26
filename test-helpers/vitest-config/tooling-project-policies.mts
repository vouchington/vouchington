type ToolingProjectPolicy = {
  environmentPolicy: 'isolated' | 'worktree-db'
  runInToolingTest: boolean
  runInToolingWorkflow: boolean
  runInDedicatedToolingWorkflow: boolean
}

export const isolatedSetupFile = './test-helpers/vitest.setup.tooling-isolated-env.mts'
export const worktreeDbSetupFile = './test-helpers/vitest.setup.tooling-worktree-env.mts'

export const toolingProjectPolicies = {
  'dev-tools': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'static-analysis-tools': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'static-analysis-ast-grep': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'ci-tools': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'github-actions': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'git-hooks': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'playwright-helpers': {
    environmentPolicy: 'worktree-db',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'i18n-extract-codemod': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
  'i18n-route-bounds': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: false,
    runInDedicatedToolingWorkflow: true,
  },
  'docker-deploy': {
    environmentPolicy: 'isolated',
    runInToolingTest: true,
    runInToolingWorkflow: true,
    runInDedicatedToolingWorkflow: false,
  },
} as const satisfies Record<string, ToolingProjectPolicy>

export type ToolingProjectName = keyof typeof toolingProjectPolicies
