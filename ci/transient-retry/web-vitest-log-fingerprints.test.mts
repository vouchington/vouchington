import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'
import { hasWebVitestSegfault } from './web-vitest-log-fingerprints.mts'

const webTestsJobName = 'test-web / web-tests (1)'
const matchingLog = [
  'RUN vX.Y.Z /Users/dev/actions-runners/1/_work/filaments/filaments',
  'VITEST_COVERAGE_ENABLED: true',
  'undefined',
  "ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command was killed with SIGSEGV (Segmentation fault): vitest run '--bail=3' --project web --shard 1/3 --passWithNoTests",
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Web',
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
      failedJobNames: [webTestsJobName, 'web'],
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
      hasWebVitestSegfault(matchingLog.replace('--shard 1/3 --passWithNoTests', '--coverage')),
    ).toBe(false)
  })

  it('does not match a web assertion failure', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'web'],
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
      failedJobNames: ['web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another non-aggregate job also fails', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'test-backend-unit / backend-tests (1)', 'web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [webTestsJobName, 'web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
