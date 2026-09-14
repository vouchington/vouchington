import type { WorkflowRunContext } from '../../transient-retry/rules.mts'

export const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  jobIds: new Map([
    ['storybook-build / storybook', 1],
    ['storybook / storybook', 2],
  ]),
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})
