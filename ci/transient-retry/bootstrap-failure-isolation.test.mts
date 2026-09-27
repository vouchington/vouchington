import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { decide } from './decide.mts'
import { RULES } from './rules.mts'

describe('bootstrap failure isolation', () => {
  it('does not apply Web Playwright consumers to Backend', async () => {
    const jobName = 'test-playwright / playwright-tests (1)'
    const log = [
      '##[group]Run ./.github/actions/setup-playwright',
      '::error::Timed out waiting for apt/dpkg locks after 120s: /var/lib/dpkg/lock-frontend',
      '##[error]Process completed with exit code 1.',
    ].join('\n')
    await expect(
      decide(
        makeCtx({
          workflowName: 'Backend',
          failedJobNames: [jobName, 'backend'],
          failedJobLogs: async () => new Map([[jobName, log]]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not let earlier optimizer output hide test output', async () => {
    const jobName = 'storybook / storybook'
    const log = [
      'VITEST_STORYBOOK_BROWSER: 1',
      'RUN /home/runner/work/example/example',
      '[vite] (client) [optimizer] scanning dependencies...',
      "The action 'Run Storybook browser tests' has timed out after 10 minutes.",
      'Terminate orphan process: pid (1118963) (chrome-headless-shell)',
      'Test Files 1 failed | 10 passed',
      'AssertionError: expected true to be false',
    ].join('\n')
    await expect(
      decide(
        makeCtx({
          failedJobNames: [jobName, 'web'],
          failedJobLogs: async () => new Map([[jobName, log]]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })
})
