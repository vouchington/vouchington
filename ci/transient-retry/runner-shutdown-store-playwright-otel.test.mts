import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

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

describe('runner-shutdown-leaf-rerun — store-playwright-otel', () => {
  it('allows cancelled store-playwright-otel as downstream of a playwright shard failure', async () => {
    const result = await decide(makeCtx('cancelled'), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does not allow cancelled store-playwright-otel when its log could not be fetched', async () => {
    const result = await decide(
      makeCtx('cancelled', '', new Set([storePlaywrightOtelJobName])),
      RULES,
    )
    expect(result).toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('allows failed store-playwright-otel as downstream when no shard artifacts were available', async () => {
    const result = await decide(makeCtx('failure', noArtifactsStoreLog), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('allows failed store-playwright-otel as downstream when log lines have prefixes', async () => {
    const result = await decide(makeCtx('failure', prefixedNoArtifactsStoreLog), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('allows store-playwright-otel with no recorded conclusion when no shard artifacts were available', async () => {
    const result = await decide(makeCtx(undefined, noArtifactsStoreLog), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('allows skipped store-playwright-otel as downstream of a playwright shard failure', async () => {
    const result = await decide(makeCtx('skipped'), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does NOT allow failed store-playwright-otel with an independent store failure', async () => {
    const result = await decide(makeCtx('failure', storeAwsFailureLog), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT allow failed store-playwright-otel with a non-error no-artifacts mention', async () => {
    const result = await decide(makeCtx('failure', storeDebugNoArtifactsLog), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT allow failed store-playwright-otel with an echoed no-artifacts command', async () => {
    const result = await decide(makeCtx('failure', storeEchoedNoArtifactsLog), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
