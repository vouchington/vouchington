import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'
import {
  hasWebVitestSegfault,
  hasWebVitestWorkerStartTimeoutAfterPassingSummary,
} from './web-vitest-log-fingerprints.mts'

const webTestsJobName = 'test-web / web-tests (1)'
const playwrightShardJobName = 'playwright-tests / playwright-tests (2)'
const storePlaywrightOtelJobName = 'store-playwright-otel'
const matchingLog = [
  'RUN vX.Y.Z /Users/jonathanong/actions-runners/1/_work/filaments/filaments',
  'VITEST_COVERAGE_ENABLED: true',
  'undefined',
  "ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command was killed with SIGSEGV (Segmentation fault): vitest run '--bail=3' --project web --maxWorkers=7 --shard 1/3 --passWithNoTests",
  '##[error]Process completed with exit code 1.',
].join('\n')
const workerStartTimeoutLog = [
  'VITEST_COVERAGE_ENABLED: false',
  'Run pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web --maxWorkers=7 --shard 1/3 --passWithNoTests',
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web --maxWorkers=7 --shard 1/3 --passWithNoTests',
  'Vitest caught 1 unhandled error during the test run.',
  'Error: [vitest-pool]: Failed to start threads worker for test files /home/runner/work/filaments/filaments/web/components/topic-claims/domain-verification-panel.mock.test.tsx.',
  'Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond',
  'Test Files  1159 passed (1159)',
  'Tests  6582 passed (6582)',
  'Errors  1 error',
  '##[error]Process completed with exit code 1.',
].join('\n')
const cleanPlaywrightShutdownLog = [
  'Running 849 tests using 3 workers, shard 2 of 2',
  '................................................................',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')
const noPlaywrightOtelArtifactsLog = '##[error]No Playwright OTel artifacts found'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('web-vitest-sigsegv', () => {
  it('matches the current publishing web Vitest SIGSEGV fingerprint on attempt 1', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-vitest-sigsegv')
  })

  it('matches the same SIGSEGV fingerprint when coverage is not publishing', () => {
    expect(
      hasWebVitestSegfault(
        matchingLog.replace('VITEST_COVERAGE_ENABLED: true', 'VITEST_COVERAGE_ENABLED: false'),
      ),
    ).toBe(true)
  })

  it('fails closed for the removed unsharded coverage command', () => {
    expect(
      hasWebVitestSegfault(
        matchingLog.replace('--maxWorkers=7 --shard 1/3 --passWithNoTests', '--coverage'),
      ),
    ).toBe(false)
  })

  it('does not match a web assertion failure', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([[webTestsJobName, 'AssertionError: expected button to be visible']]),
        ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when the web test job is not the failed leaf job', async () => {
    const ctx = makeCtx({
      failedJobNames: ['Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another non-aggregate job also fails', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'test-backend-unit / backend-tests (1)', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [webTestsJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('main-web-vitest-worker-start-timeout-after-pass', () => {
  it('matches the worker timeout fingerprint with simultaneous clean Playwright shutdowns', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      failedJobNames: [webTestsJobName, playwrightShardJobName, storePlaywrightOtelJobName],
      jobConclusions: new Map([
        [webTestsJobName, 'failure'],
        [playwrightShardJobName, 'failure'],
        [storePlaywrightOtelJobName, 'failure'],
      ]),
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [webTestsJobName, workerStartTimeoutLog],
            [playwrightShardJobName, cleanPlaywrightShutdownLog],
            [storePlaywrightOtelJobName, noPlaywrightOtelArtifactsLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-vitest-worker-start-timeout-after-pass')
  })

  it.each(['cancelled', 'skipped'])(
    'matches when store-playwright-otel is %s downstream of a failed Playwright shard',
    async storeConclusion => {
      const ctx = makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [webTestsJobName, playwrightShardJobName, storePlaywrightOtelJobName],
        jobConclusions: new Map([
          [webTestsJobName, 'failure'],
          [playwrightShardJobName, 'failure'],
          [storePlaywrightOtelJobName, storeConclusion],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webTestsJobName, workerStartTimeoutLog],
              [playwrightShardJobName, cleanPlaywrightShutdownLog],
              [storePlaywrightOtelJobName, ''],
            ]),
          ),
      })

      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('main-web-vitest-worker-start-timeout-after-pass')
    },
  )

  it('matches the worker timeout fingerprint when only web tests fail', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      failedJobNames: [webTestsJobName],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, workerStartTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-vitest-worker-start-timeout-after-pass')
  })

  it('does not match when the web Vitest summary contains failures', async () => {
    expect(
      hasWebVitestWorkerStartTimeoutAfterPassingSummary(
        workerStartTimeoutLog.replace('Test Files  1159 passed (1159)', 'Test Files  1 failed'),
      ),
    ).toBe(false)
  })

  it('does not match when a simultaneous Playwright failure is a test failure', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      failedJobNames: [webTestsJobName, playwrightShardJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [webTestsJobName, workerStartTimeoutLog],
            [
              playwrightShardJobName,
              [cleanPlaywrightShutdownLog, 'Error: expect(locator).toBeVisible() failed'].join(
                '\n',
              ),
            ],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when store-playwright-otel has an independent failure', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      failedJobNames: [webTestsJobName, playwrightShardJobName, storePlaywrightOtelJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [webTestsJobName, workerStartTimeoutLog],
            [playwrightShardJobName, cleanPlaywrightShutdownLog],
            [storePlaywrightOtelJobName, 'AccessDenied: cannot write OTel output'],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      runAttempt: 2,
      failedJobNames: [webTestsJobName],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, workerStartTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
