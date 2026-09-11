import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunRule } from './runner-shutdown-rules.mts'

describe('runner-shutdown-leaf-rerun — aggregate fan-ins', () => {
  it('does not fetch logs when only aggregate fan-ins failed', async () => {
    let failedJobLogFetches = 0
    const result = await runnerShutdownLeafRerunRule.match({
      workflowName: 'CI',
      conclusion: 'failure',
      runAttempt: 1,
      failedJobNames: ['tests', 'build'],
      failedJobLogs: () => {
        failedJobLogFetches += 1
        return Promise.resolve(new Map())
      },
      failedJobAnnotations: () => Promise.resolve([]),
    })

    expect(result).toBe(false)
    expect(failedJobLogFetches).toBe(0)
  })

  it('fails closed when the Patch Coverage log could not be fetched', async () => {
    const result = await runnerShutdownLeafRerunRule.match({
      workflowName: 'CI',
      conclusion: 'failure',
      runAttempt: 1,
      failedJobNames: ['test-web / web-tests (1)', 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              'test-web / web-tests (1)',
              '##[error]The runner has received a shutdown signal.\n##[error]The operation was canceled.',
            ],
          ]),
        ),
      failedJobLogFetchFailures: () => Promise.resolve(new Set(['Patch Coverage'])),
      failedJobAnnotations: () => Promise.resolve([]),
    })

    expect(result).toBe(false)
  })
})
