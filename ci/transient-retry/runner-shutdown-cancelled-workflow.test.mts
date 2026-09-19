import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts) -- exercised directly here rather
// than through decide()/RULES. Covers isCancelledKnownConsumerWithoutFailure's non-OOM correctness
// (a cancelled sibling matrix job alongside a cleanly-shutdown failed leaf), distinct from
// runner-shutdown-safety-regressions.test.mts's OOM-interaction coverage of the same branch.

const failedShardJobName = 'test-playwright / playwright-tests (2)'
const cancelledShardJobName = 'test-playwright / playwright-tests (1)'
const shutdownLog = [
  '$ cross-env NODE_ENV=production next build',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const makeCtx = (cancelledShardLog: string): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'cancelled',
  runAttempt: 2,
  failedJobNames: [failedShardJobName, cancelledShardJobName, 'tests', 'build'],
  jobConclusions: new Map([
    [failedShardJobName, 'failure'],
    [cancelledShardJobName, 'cancelled'],
    ['tests', 'failure'],
    ['build', 'failure'],
  ]),
  failedJobLogs: () =>
    Promise.resolve(
      new Map([
        [failedShardJobName, shutdownLog],
        [cancelledShardJobName, cancelledShardLog],
      ]),
    ),
  failedJobAnnotations: () => Promise.resolve([]),
})

describe('runnerShutdownLeafRerunMatch — cancelled workflow conclusion', () => {
  it('reruns when a clean Playwright shutdown cancels a sibling matrix job', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('Initialize containers\n##[error]The operation was canceled.'),
    )
    expect(matched).toBe(true)
  })

  it('does not ignore a cancelled sibling with its own failure signal', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('Error: expect(locator).toBeVisible()\n##[error]The operation was canceled.'),
    )
    expect(matched).toBe(false)
  })

  it('does not ignore a cancelled sibling when log download returned no evidence', async () => {
    const matched = await runnerShutdownLeafRerunMatch(makeCtx(''))
    expect(matched).toBe(false)
  })

  it('does not ignore a cancelled sibling with a non-SIGTERM exit code', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('##[error]Process completed with exit code 1.\n##[error]The operation was canceled.'),
    )
    expect(matched).toBe(false)
  })
})
