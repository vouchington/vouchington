import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts) -- exercised directly here rather
// than through decide()/RULES. See runner-shutdown-web-rules.test.mts for the web consumers.

const playwrightShardJobName = 'test-playwright / playwright-tests (1)'
const storePlaywrightOtelJobName = 'store-playwright-otel'

const playwrightCleanShutdownLog = [
  '$ cross-env NODE_ENV=production next build',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const noArtifactsStoreLog = [
  'Run ./ci/store-playwright-otel.sh',
  '##[error]No Playwright OTel artifacts found',
  '##[error]Process completed with exit code 1.',
].join('\n')

const prefixedNoArtifactsStoreLog = [
  '2026-06-29T14:22:17.1234567Z Run ./ci/store-playwright-otel.sh',
  '2026-06-29T14:22:18.1234567Z ##[error]No Playwright OTel artifacts found',
  '2026-06-29T14:22:19.1234567Z ##[error]Process completed with exit code 1.',
].join('\n')

const storeAwsFailureLog = [
  'Run ./ci/store-playwright-otel.sh',
  'fatal error: An error occurred (AccessDenied) when calling the ListObjectsV2 operation',
  '##[error]Process completed with exit code 1.',
].join('\n')

const storeDebugNoArtifactsLog = [
  'Run ./ci/store-playwright-otel.sh',
  '[debug]No Playwright OTel artifacts found while listing previous attempts',
  '##[error]Process completed with exit code 1.',
].join('\n')

const storeEchoedNoArtifactsLog = [
  'Run ./ci/store-playwright-otel.sh',
  '+ echo "##[error]No Playwright OTel artifacts found"',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (
  storeConclusion: string | undefined,
  storeLog = '',
  logFetchFailures = new Set<string>(),
): WorkflowRunContext => {
  const jobConclusions = new Map([
    [playwrightShardJobName, 'failure'],
    ['tests', 'failure'],
    ['build', 'failure'],
  ])
  if (storeConclusion !== undefined) jobConclusions.set(storePlaywrightOtelJobName, storeConclusion)
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [playwrightShardJobName, storePlaywrightOtelJobName, 'tests', 'build'],
    jobConclusions,
    failedJobLogs: () =>
      Promise.resolve(
        new Map([
          [playwrightShardJobName, playwrightCleanShutdownLog],
          [storePlaywrightOtelJobName, storeLog],
        ]),
      ),
    failedJobLogFetchFailures: () => Promise.resolve(logFetchFailures),
    failedJobAnnotations: () => Promise.resolve([]),
  }
}

describe('runnerShutdownLeafRerunMatch — store-playwright-otel', () => {
  it('allows cancelled store-playwright-otel as downstream of a playwright shard failure', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx('cancelled'))).toBe(true)
  })

  it('does not allow cancelled store-playwright-otel when its log could not be fetched', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('cancelled', '', new Set([storePlaywrightOtelJobName])),
    )
    expect(matched).toBe(false)
  })

  it('allows failed store-playwright-otel as downstream when no shard artifacts were available', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx('failure', noArtifactsStoreLog))).toBe(true)
  })

  it('allows failed store-playwright-otel as downstream when log lines have prefixes', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('failure', prefixedNoArtifactsStoreLog),
    )
    expect(matched).toBe(true)
  })

  it('allows store-playwright-otel with no recorded conclusion when no shard artifacts were available', async () => {
    const matched = await runnerShutdownLeafRerunMatch(makeCtx(undefined, noArtifactsStoreLog))
    expect(matched).toBe(true)
  })

  it('allows skipped store-playwright-otel as downstream of a playwright shard failure', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx('skipped'))).toBe(true)
  })

  it('does NOT allow failed store-playwright-otel with an independent store failure', async () => {
    const matched = await runnerShutdownLeafRerunMatch(makeCtx('failure', storeAwsFailureLog))
    expect(matched).toBe(false)
  })

  it('does NOT allow failed store-playwright-otel with a non-error no-artifacts mention', async () => {
    const matched = await runnerShutdownLeafRerunMatch(makeCtx('failure', storeDebugNoArtifactsLog))
    expect(matched).toBe(false)
  })

  it('does NOT allow failed store-playwright-otel with an echoed no-artifacts command', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx('failure', storeEchoedNoArtifactsLog),
    )
    expect(matched).toBe(false)
  })
})
