import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const testCoverageJobName = 'Patch Coverage'
const playwrightShardOneJobName = 'test-playwright / playwright-tests (1)'
const ruleId = 'coverage-artifact-stale-rerun-missing'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const patchCoverageStaleRerunMissingLog = [
  "Filtering artifacts by pattern 'coverage-*'",
  '[optional-run-artifacts] selection selector=pattern count=0',
  '[optional-run-artifacts] result=unavailable selector=pattern exit=3',
  'All coverage jobs passed or were skipped',
  '##[error]Missing valid coverage artifact for test-backend-modules: coverage-backend-modules/lcov.info and coverage-manifest.json',
  '##[error]Missing valid coverage artifact for test-web-integration: coverage-web-integration/lcov.info and coverage-manifest.json',
  '##[error]Missing valid coverage artifact for test-backend-unit: coverage-backend-shard-1/lcov.info and coverage-manifest.json',
  '##[error]Missing valid coverage artifact for test-backend-unit: coverage-backend-shard-2/lcov.info and coverage-manifest.json',
  '##[error]Process completed with exit code 1.',
].join('\n')

describe('coverage-artifact-stale-rerun-missing', () => {
  it('matches a delayed rerun with no listed coverage artifacts', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([[ruleId, 1]]),
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageStaleRerunMissingLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe(ruleId)
  })

  it('does not match on the first attempt', async () => {
    const ctx = makeCtx({
      runAttempt: 1,
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageStaleRerunMissingLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another failed leaf has a real Playwright failure', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([[ruleId, 1]]),
      failedJobNames: [playwrightShardOneJobName, testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [playwrightShardOneJobName, 'Error: expect(locator).toBeVisible() failed'],
            [testCoverageJobName, patchCoverageStaleRerunMissingLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 4,
      ruleAttempts: new Map([[ruleId, 2]]),
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageStaleRerunMissingLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when at least one coverage artifact was actually selected', async () => {
    const log = patchCoverageStaleRerunMissingLog.replace(
      '[optional-run-artifacts] selection selector=pattern count=0',
      '[optional-run-artifacts] selected artifact=coverage-backend-modules\n[optional-run-artifacts] selection selector=pattern count=1',
    )
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([[ruleId, 1]]),
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[testCoverageJobName, log]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a coverage producer itself failed or was cancelled', async () => {
    const log = patchCoverageStaleRerunMissingLog.replace(
      'All coverage jobs passed or were skipped',
      'One or more coverage jobs failed or were cancelled',
    )
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([[ruleId, 1]]),
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[testCoverageJobName, log]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
