import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendUnitJobName = 'test-backend-unit / backend-tests (1)'
const backendUnitJobId = 918_273_645

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  jobIds: new Map([[backendUnitJobName, backendUnitJobId]]),
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const workerUnexpectedExitErrorBlock = [
  'Unhandled Error',
  'Error: [vitest-pool]: Worker forks emitted error.',
  'Caused by: Error: Worker exited unexpectedly',
].join('\n')
const workerUnexpectedExitAfterPassLog = [
  'Run pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/data-stores/analytics --project backend-data-stores --shard 1/2 --coverage',
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/data-stores/analytics --project backend-data-stores --shard 1/2 --coverage',
  'Vitest caught 2 unhandled errors during the test run.',
  workerUnexpectedExitErrorBlock,
  workerUnexpectedExitErrorBlock,
  'Test Files  829 passed | 2 skipped (832)',
  'Tests  5872 passed | 9 skipped (5882)',
  'Errors  2 errors',
  '##[error]Process completed with exit code 1.',
].join('\n')

const singularWorkerUnexpectedExitAfterPassLog = workerUnexpectedExitAfterPassLog
  .replace(
    'Vitest caught 2 unhandled errors during the test run.',
    'Vitest caught 1 unhandled error during the test run.',
  )
  .replace(
    `${workerUnexpectedExitErrorBlock}\n${workerUnexpectedExitErrorBlock}`,
    workerUnexpectedExitErrorBlock,
  )
  .replace('Errors  2 errors', 'Errors  1 error')

const rawGitHubLogPrefix =
  'test-backend-unit / backend-tests (1)\tUNKNOWN STEP\t2026-07-03T04:20:19.0000000Z '
const timestampPrefixedWorkerUnexpectedExitAfterPassLog = workerUnexpectedExitAfterPassLog
  .replace('Test Files  829 passed', 'Test Files ^[[22m ^[[1m^[[32m829 passed^[[39m')
  .replace('Tests  5872 passed', 'Tests ^[[22m ^[[1m^[[32m5872 passed^[[39m')
  .split('\n')
  .map(line => `${rawGitHubLogPrefix}${line}`)
  .join('\n')

describe('backend-unit-vitest-worker-exit-after-pass', () => {
  it('matches an isolated backend Vitest worker unexpected exit after all tests pass', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerUnexpectedExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
    expect(result.rerunJobId).toBe(backendUnitJobId)
  })

  it('matches when there is exactly 1 unhandled worker-exit error after all tests pass', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendUnitJobName, singularWorkerUnexpectedExitAfterPassLog]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('matches when cancelled sibling jobs are present but not genuine failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'build'],
        jobConclusions: new Map([
          [backendUnitJobName, 'failure'],
          ['build', 'cancelled'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerUnexpectedExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('matches when non-summary output mentions Test Files and failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                workerUnexpectedExitAfterPassLog.replace(
                  'Vitest caught 2 unhandled errors during the test run.',
                  'Checking Test Files... failed to load an optional diagnostic before Vitest summary\nVitest caught 2 unhandled errors during the test run.',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('matches timestamp-prefixed logs with caret-escaped ANSI Vitest summaries', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendUnitJobName, timestampPrefixedWorkerUnexpectedExitAfterPassLog]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('does not match when the unhandled-error count exceeds the worker-exit sections', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                workerUnexpectedExitAfterPassLog.replace(
                  `${workerUnexpectedExitErrorBlock}\n${workerUnexpectedExitErrorBlock}`,
                  workerUnexpectedExitErrorBlock,
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when one unhandled error is not a worker exit', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                workerUnexpectedExitAfterPassLog.replace(
                  workerUnexpectedExitErrorBlock,
                  [
                    'Unhandled Error',
                    'Error: expected cleanup to settle before process exit',
                    'Caused by: Error: application teardown failed',
                  ].join('\n'),
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when the backend Vitest summary contains failed files', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                workerUnexpectedExitAfterPassLog.replace(
                  'Test Files  829 passed | 2 skipped (832)',
                  'Test Files  1 failed | 828 passed | 2 skipped (832)',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match timestamp-prefixed logs with a failed Vitest summary', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                timestampPrefixedWorkerUnexpectedExitAfterPassLog.replace(
                  'Test Files ^[[22m ^[[1m^[[32m829 passed^[[39m | 2 skipped (832)',
                  'Test Files  1 failed | 828 passed | 2 skipped (832)',
                ),
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
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerUnexpectedExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('matches on the second rule attempt because unrelated first-attempt flakes can consume run attempt 1', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerUnexpectedExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 3,
        failedJobNames: [backendUnitJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerUnexpectedExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
