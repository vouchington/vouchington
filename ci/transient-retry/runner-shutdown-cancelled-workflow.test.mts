import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

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

describe('runner-shutdown-leaf-rerun — cancelled workflow conclusion', () => {
  it('reruns when a clean Playwright shutdown cancels a sibling matrix job', async () => {
    const result = await decide(
      makeCtx('Initialize containers\n##[error]The operation was canceled.'),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does not ignore a cancelled sibling with its own failure signal', async () => {
    const result = await decide(
      makeCtx('Error: expect(locator).toBeVisible()\n##[error]The operation was canceled.'),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not ignore a cancelled sibling when log download returned no evidence', async () => {
    const result = await decide(makeCtx(''), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not ignore a cancelled sibling with a non-SIGTERM exit code', async () => {
    const result = await decide(
      makeCtx('##[error]Process completed with exit code 1.\n##[error]The operation was canceled.'),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
