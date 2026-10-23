import type { WorkflowRunContext } from '../../transient-retry/rules.mts'

export const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  jobNames: overrides.jobNames ?? overrides.failedJobNames ?? [],
  jobConclusions: new Map((overrides.failedJobNames ?? []).map(name => [name, 'failure'])),
  jobSteps: new Map(),
  failedJobLogFetchFailures: () => Promise.resolve(new Set()),
  jobLogs: () => overrides.failedJobLogs?.() ?? Promise.resolve(new Map()),
  failedJobAnnotationFetchFailures: () => Promise.resolve(new Set()),
  workflowName: 'Web',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})
