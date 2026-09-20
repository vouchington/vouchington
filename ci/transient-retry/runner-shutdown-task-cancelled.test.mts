import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// Production registration and retry accounting are covered through decide()/RULES in
// runner-shutdown-production-rule.test.mts. This direct matcher suite covers the A-task-cancelled
// marker variant.

const playwrightShardJobName = 'playwright-tests / playwright-tests (1)'

const serviceInitTaskCancelledLog = [
  'Waiting for all services to be ready',
  'postgres service is starting, waiting 3 seconds before checking again.',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]A task was canceled.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [playwrightShardJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[playwrightShardJobName, serviceInitTaskCancelledLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch task-cancelled variant', () => {
  it('reruns when a Main CI web Playwright shard is shutdown during service initialization', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx())).toBe(true)
  })

  it('does NOT rerun when a Playwright failure precedes A task was canceled.', async () => {
    const realFailureLog = [
      'Error: expect(received).toBe(expected)',
      serviceInitTaskCancelledLog,
    ].join('\n')
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx({
        failedJobLogs: () => Promise.resolve(new Map([[playwrightShardJobName, realFailureLog]])),
      }),
    )
    expect(matched).toBe(false)
  })
})
