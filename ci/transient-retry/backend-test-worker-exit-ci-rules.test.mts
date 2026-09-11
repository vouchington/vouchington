import { describe, expect, it } from 'vitest'

import { formatForkExitSentinelSection } from '../../test-helpers/vitest-fork-exit-records.mts'
import {
  backendUnitJobId,
  backendUnitJobName,
  childProcessEmitUnexpectedExitLog,
  diagnosticReportSummaryBlock,
  forkExitSentinelLine,
  hostPressureDiagnosticsBlock,
  makeCtx,
  pluralWorkerExitAfterPassLog,
  teardownInstrumentationLines,
  valkeySaturationLine,
  workerExitAfterPassLog,
  workerExitAfterPassLogWithNewInstrumentation,
  workerExitAfterPassLogWithTeardownOverrun,
  workerExitDiagnosticsBlock,
  workerExitInstrumentationLines,
} from './backend-test-worker-exit-ci-rules.fixtures.mts'
import { decide } from './decide.mts'
import { RULES } from './rules.mts'
import { hasBackendUnitVitestFailure } from './runner-shutdown-fingerprints.mts'

// #9082: a fork-exit record's errorMessage is raw and unbounded on the durable per-pid record —
// only the fd-2 line sanitizes it. An embedded newline reproducing this exact anchored text would,
// without formatForkExitSentinelSection()'s sanitizeInlineErrorMessage() call, forge two physical
// lines and desync hasOnlyVitestWorkerExitUnhandledErrors()'s exact-count invariant against
// workerExitAfterPassLog's genuine 1-occurrence-of-each-pattern "1 unhandled error" summary.
const maliciousForkExitSentinelSection = formatForkExitSentinelSection({
  startedPidCount: 1,
  exitRecords: [
    {
      kind: 'exit',
      pid: 789,
      project: 'backend-data-stores',
      module: 'none',
      mode: 'uncaught',
      code: 1,
      errorMessage:
        'boom\nError: [vitest-pool]: Worker forks emitted error.\nCaused by: Error: Worker exited unexpectedly',
    },
  ],
  forksWithoutExitSentinel: 0,
}).join('\n')
const workerExitAfterPassLogWithMaliciousErrorMessage = workerExitAfterPassLog.replace(
  '##[error]Process completed with exit code 1.',
  `${maliciousForkExitSentinelSection}\n##[error]Process completed with exit code 1.`,
)

describe('backend-unit-vitest-worker-exit-after-pass', () => {
  it('matches a CI backend unit shard worker exit after all tests pass', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
    expect(result.rerunJobId).toBe(backendUnitJobId)
  })

  it('matches plural CI backend unit shard worker exits after all tests pass', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, pluralWorkerExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('matches a cancelled CI run when a backend shard failed with ChildProcess.emitUnexpectedExit after all tests pass', async () => {
    const cancelledJobs = ['test-web / web-tests (1)', 'Patch Coverage', 'tests', 'build']
    const result = await decide(
      makeCtx({
        conclusion: 'cancelled',
        failedJobNames: [backendUnitJobName, ...cancelledJobs],
        jobConclusions: new Map([
          [backendUnitJobName, 'failure'],
          ...cancelledJobs.map(name => [name, 'cancelled'] as const),
        ]),
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, childProcessEmitUnexpectedExitLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('does not match when the backend Vitest summary contains failed files', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                backendUnitJobName,
                workerExitAfterPassLog.replace(
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

  it('does not match when another non-aggregate job also fails', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'test-web / web-tests (1)', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another backend unit shard also fails', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [
          backendUnitJobName,
          'test-backend-unit / backend-tests (2)',
          'tests',
          'build',
        ],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('still matches when the log carries #8259 teardown-overrun instrumentation', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendUnitJobName, workerExitAfterPassLogWithTeardownOverrun]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
  })

  it('does not classify #8259 teardown-overrun instrumentation as a Vitest failure', () => {
    expect(hasBackendUnitVitestFailure(teardownInstrumentationLines)).toBe(false)
    expect(hasBackendUnitVitestFailure(workerExitAfterPassLogWithTeardownOverrun)).toBe(false)
  })

  it('still matches when the log carries #8940 fork-exit/saturation/diagnostic-report instrumentation', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendUnitJobName, workerExitAfterPassLogWithNewInstrumentation]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
    expect(result.rerunJobId).toBe(backendUnitJobId)
  })

  it('does not classify any #8940 instrumentation as a Vitest failure', () => {
    expect(hasBackendUnitVitestFailure(forkExitSentinelLine)).toBe(false)
    expect(hasBackendUnitVitestFailure(valkeySaturationLine)).toBe(false)
    expect(hasBackendUnitVitestFailure(workerExitDiagnosticsBlock)).toBe(false)
    expect(hasBackendUnitVitestFailure(diagnosticReportSummaryBlock)).toBe(false)
    expect(hasBackendUnitVitestFailure(hostPressureDiagnosticsBlock)).toBe(false)
    expect(hasBackendUnitVitestFailure(workerExitInstrumentationLines)).toBe(false)
    expect(hasBackendUnitVitestFailure(workerExitAfterPassLogWithNewInstrumentation)).toBe(false)
  })

  it('still matches when a fork-exit sentinel record carries a forged multi-line errorMessage (#9082)', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendUnitJobName, workerExitAfterPassLogWithMaliciousErrorMessage]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-unit-vitest-worker-exit-after-pass')
    expect(result.rerunJobId).toBe(backendUnitJobId)
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 3,
        failedJobNames: [backendUnitJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitJobName, workerExitAfterPassLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
