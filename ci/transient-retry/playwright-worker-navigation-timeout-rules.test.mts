import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const mainWebPlaywrightShardOneJobName = 'playwright-tests / playwright-tests (1)'
const storePlaywrightOtelJobName = 'store-playwright-otel'

const workerNavigationTimeoutLog = [
  '##[group]Run set -euo pipefail',
  'pnpm exec ./ci/with-node-test-options playwright test --shard=2/2',
  '##[endgroup]',
  '[backend] API Server: serving at http://localhost:57377',
  '[web] - Local:         http://localhost:33843',
  '[cloudflare-worker] start-wrangler: starting wrangler dev on port 53747',
  'Running 849 tests using 3 workers, shard 2 of 2',
  '2026-07-01T15:25:06.873308Z  WARN logger_core: received error - timed out',
  '2026-07-01T15:25:07.337701Z  WARN logger_core: received error - timed out',
  '::error file=playwright/helpers/navigate-to.mts,title=[chromium] › settings,line=27,col=16:: TimeoutError: page.goto: Timeout 15000ms exceeded.',
  'Retry #1 ───────────────────────────────────────────────────────────────────────────────────────',
  'Error: retryOnConnectionLost: connection retry budget exceeded',
  '   at ../helpers/retry-on-connection-lost.mts:106',
  '    [cause]: Error: connection retry budget exceeded',
  '  1 failed',
  '    [chromium] › playwright/tests/topics/settings-boundary.spec.mts:23:3 › redirects',
  '  3 flaky',
  '    [chromium] › playwright/tests/posts/create-submit-redirect.spec.mts:27:3 › redirects',
  '  23 skipped',
  '  822 passed (7.4m)',
  '##[error]Process completed with exit code 1.',
].join('\n')

const routeSpecificNavigationTimeoutLog = workerNavigationTimeoutLog.replace(
  /2026-07-01T15:25:0[67]\.\d+Z {2}WARN logger_core: received error - timed out\n/g,
  '',
)

const assertionFailureAfterWorkerTimeoutLog = workerNavigationTimeoutLog
  .replace(
    'TimeoutError: page.goto: Timeout 15000ms exceeded.',
    'Error: expect(page).toHaveURL(expected) failed',
  )
  .replace('Error: retryOnConnectionLost: connection retry budget exceeded', '')
const noPlaywrightOtelArtifactsLog = '##[error]No Playwright OTel artifacts found'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 2,
  ruleAttempts: new Map([['main-web-playwright-worker-navigation-timeout', 1]]),
  failedJobNames: [mainWebPlaywrightShardOneJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, workerNavigationTimeoutLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-playwright-worker-navigation-timeout', () => {
  it('reruns the observed Main CI web Playwright worker navigation timeout on attempt 2', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-worker-navigation-timeout')
  })

  it('reruns when aggregate fan-ins and downstream OTel storage also failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [
          mainWebPlaywrightShardOneJobName,
          'tests',
          'build',
          storePlaywrightOtelJobName,
        ],
        jobConclusions: new Map([
          [mainWebPlaywrightShardOneJobName, 'failure'],
          [storePlaywrightOtelJobName, 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [mainWebPlaywrightShardOneJobName, workerNavigationTimeoutLog],
              [storePlaywrightOtelJobName, noPlaywrightOtelArtifactsLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-worker-navigation-timeout')
  })

  it('reruns when the same worker timeout produces multiple failed specs', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                mainWebPlaywrightShardOneJobName,
                workerNavigationTimeoutLog
                  .replace(
                    'TimeoutError: page.goto: Timeout 15000ms exceeded.',
                    'TimeoutError: page.goto: Timeout 30000ms exceeded.',
                  )
                  .replace('  1 failed', '  2 failed'),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-worker-navigation-timeout')
  })

  it('does not match a route-specific navigation timeout without worker timeout logs', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[mainWebPlaywrightShardOneJobName, routeSpecificNavigationTimeoutLog]]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a normal Playwright assertion failure after worker timeout logs', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[mainWebPlaywrightShardOneJobName, assertionFailureAfterWorkerTimeoutLog]]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a separate Playwright assertion fails in the same shard log', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                mainWebPlaywrightShardOneJobName,
                [
                  workerNavigationTimeoutLog,
                  'Error: expect(locator).toBeVisible() failed',
                  '    at playwright/tests/topics/real-regression.spec.mts:42:19',
                ].join('\n'),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a separate Playwright timeout fails in the same shard log', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                mainWebPlaywrightShardOneJobName,
                [
                  workerNavigationTimeoutLog,
                  '::error file=playwright/tests/topics/real-timeout.spec.mts,title=[chromium] › topics:: TimeoutError: page.goto: Timeout 15000ms exceeded.',
                  '    at playwright/tests/topics/real-timeout.spec.mts:12:14',
                ].join('\n'),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not treat non-assertion FAIL text as a Playwright assertion failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                mainWebPlaywrightShardOneJobName,
                [
                  workerNavigationTimeoutLog,
                  'WARN infrastructure: FAIL to download optional debug artifact',
                ].join('\n'),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-worker-navigation-timeout')
  })

  it('does not match when any unexpected non-shard job also failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [mainWebPlaywrightShardOneJobName, 'test-web / web-tests (1)'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when store-playwright-otel has an independent failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [mainWebPlaywrightShardOneJobName, storePlaywrightOtelJobName],
        jobConclusions: new Map([
          [mainWebPlaywrightShardOneJobName, 'failure'],
          [storePlaywrightOtelJobName, 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [mainWebPlaywrightShardOneJobName, workerNavigationTimeoutLog],
              [storePlaywrightOtelJobName, 'AccessDenied: cannot write OTel output'],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 3,
        ruleAttempts: new Map([['main-web-playwright-worker-navigation-timeout', 2]]),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
