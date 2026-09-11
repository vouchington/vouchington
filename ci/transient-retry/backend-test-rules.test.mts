import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendUnitJobName = 'test-backend-unit / backend-tests (1)'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const matchingLog = [
  '> backend-data-stores backend/api/v1/auth/logout.test.mts (4 tests | 1 failed) 2771ms',
  'x should not be blocked by route rate limits 1814ms',
  'Failed Tests 1',
  'FAIL backend-data-stores backend/api/v1/auth/logout.test.mts > POST /api/v1/auth/logout > should not be blocked by route rate limits',
  'TimeoutError: timed out',
  '> GlideClient.processResponse node_modules/.pnpm/@valkey+valkey-glide@2.4.1/node_modules/@valkey/valkey-glide/build-ts/BaseClient.js:385:20',
  '> GlideClient.handleReadData node_modules/.pnpm/@valkey+valkey-glide@2.4.1/node_modules/@valkey/valkey-glide/build-ts/BaseClient.js:293:22',
  'Test Files  1 failed | 804 passed | 2 skipped (807)',
  'Tests  1 failed | 5717 passed | 9 skipped (5727)',
].join('\n')

const caretAnsiMatchingLog = matchingLog
  .replace('TimeoutError: timed out', '^[[31m^[[1mTimeoutError^[[22m: timed out^[[39m')
  .replace('Test Files  1 failed', 'Test Files ^[[22m ^[[1m^[[31m1 failed')

describe('backend-unit-valkey-glide-timeout', () => {
  it('matches an isolated backend logout test Valkey GLIDE timeout on Main CI backend', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, matchingLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-valkey-glide-timeout')
  })

  it('matches when cancelled sibling jobs are present but not genuine failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'build / build'],
        jobConclusions: new Map([
          [backendUnitJobName, 'failure'],
          ['build / build', 'cancelled'],
        ]),
        failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, matchingLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-valkey-glide-timeout')
  })

  it('matches logs with gh run view caret-escaped ANSI sequences', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, caretAnsiMatchingLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-valkey-glide-timeout')
  })

  it('does not match ordinary backend assertions', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                [
                  'FAIL backend-data-stores backend/api/v1/auth/logout.test.mts > POST /api/v1/auth/logout > should not be blocked by route rate limits',
                  'AssertionError: expected 429 to be 204',
                  'Test Files  1 failed | 804 passed | 2 skipped (807)',
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

  it('does not match when another backend unit shard also fails', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'test-backend-unit / backend-tests (2)'],
        failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, matchingLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, matchingLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
