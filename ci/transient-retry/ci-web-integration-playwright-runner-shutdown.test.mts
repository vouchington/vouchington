import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts) -- exercised directly here rather
// than through decide()/RULES. See runner-shutdown-web-rules.test.mts for the web consumers. The
// former "does not match after the retry cap is exhausted" test is dropped: maxAttempts accounting is
// a decide()/RULES-level concept the bare predicate no longer has.

const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const playwrightShardOneJobName = 'test-playwright / playwright-tests (1)'
const playwrightShardTwoJobName = 'test-playwright / playwright-tests (2)'
const matchingLog = [
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-20T11:36:09.0000000Z $ cross-env NODE_ENV=production next build',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-20T11:36:27.6462628Z ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-20T11:36:27.7794550Z ELIFECYCLE Command failed.',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-20T11:36:27.8354649Z ##[error]The operation was canceled.',
].join('\n')
const assertionFailureLog = matchingLog
  .replace(
    '##[error]The runner has received a shutdown signal.',
    'Error: expected true to be false',
  )
  .replace('##[error]The operation was canceled.', '##[error]Process completed with exit code 1.')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [
    webIntegrationJobName,
    playwrightShardOneJobName,
    playwrightShardTwoJobName,
    'Patch Coverage',
    'tests',
    'build',
  ],
  failedJobLogs: () =>
    Promise.resolve(
      new Map([
        [webIntegrationJobName, matchingLog],
        [playwrightShardOneJobName, matchingLog],
        [playwrightShardTwoJobName, matchingLog],
      ]),
    ),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch (CI web-integration + playwright)', () => {
  it('reruns CI when web integration and Playwright shards all fail from runner shutdown', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx())).toBe(true)
  })

  it('does not match when the web integration failure has a test assertion', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx({
        failedJobNames: [
          webIntegrationJobName,
          playwrightShardOneJobName,
          'Patch Coverage',
          'tests',
          'build',
        ],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, assertionFailureLog],
              [playwrightShardOneJobName, matchingLog],
            ]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })

  it('does not match when another leaf job failed in the same run', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx({
        failedJobNames: [
          webIntegrationJobName,
          playwrightShardOneJobName,
          'test-cloudflare-worker / cloudflare-worker-tests',
          'tests',
          'build',
        ],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, matchingLog],
              [playwrightShardOneJobName, matchingLog],
            ]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })
})
