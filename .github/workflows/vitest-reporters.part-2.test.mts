import { describe, expect, it } from 'vitest'

import {
  formatWorkerExitDiagnostics,
  isWorkerExitError,
} from '../../test-helpers/vitest-ci-reporters.mts'
import { formatTeardownOverrunDiagnostics } from '../../test-helpers/vitest-teardown-overrun-diagnostics.mts'

// Companion file `vitest-reporters.test.mts` covers the reporter/blob-upload workflow wiring;
// this file was split out to stay under the 300-line vitest test-file cap and covers only the
// worker-exit and teardown-overrun diagnostics formatting.
describe('Vitest CI reporters (part 2)', () => {
  it('formats bounded worker-exit diagnostics for matching unhandled errors', () => {
    const error = {
      name: 'Error',
      message:
        'Error: [vitest-pool]: Worker forks emitted error.\nCaused by: Error: Worker exited unexpectedly',
      signal: 'SIGTERM',
      cause: {
        name: 'Error',
        message: 'Caused by: Error: Worker exited unexpectedly',
      },
    }

    expect(isWorkerExitError(error)).toBe(true)
    expect(isWorkerExitError({ message: 'ordinary failure' })).toBe(false)

    const output = formatWorkerExitDiagnostics(
      'failed',
      [
        { kind: 'queued', moduleId: 'queued.test.mts' },
        { kind: 'started', moduleId: 'started.test.mts' },
        { kind: 'ended', moduleId: 'ended.test.mts' },
      ],
      ['stderr line before exit'],
      [error],
      ['stuck.test.mts'],
      {
        startedPidCount: 2,
        exitRecords: [
          {
            kind: 'exit',
            pid: 123,
            project: 'backend-mocks',
            module: 'foo.test.mts',
            mode: 'exit',
            code: 0,
          },
          {
            kind: 'exit',
            pid: 456,
            project: 'backend-data-stores',
            module: 'none',
            mode: 'uncaught',
            code: 1,
            errorMessage: 'boom',
            errorStack: 'Error: boom\n    at Timeout._onTimeout',
          },
        ],
        forksWithoutExitSentinel: 1,
      },
    )
    expect(output).toContain('[vitest-worker-exit-diagnostics]')
    expect(output).toContain('recent modules:')
    expect(output).toContain('queued: queued.test.mts')
    expect(output).toContain('started: started.test.mts')
    expect(output).toContain('ended: ended.test.mts')
    expect(output).toContain('main-process: pid=')
    expect(output).toContain('unfinished modules:')
    expect(output).toContain('stuck.test.mts')
    expect(output).toContain('recent stderr:')
    expect(output).toContain('stderr line before exit')
    expect(output).toContain('SIGTERM')
    expect(output).toContain('Worker forks emitted error.')
    expect(output).toContain('Worker exited unexpectedly')
    expect(output).toContain('forks started: 2')
    expect(output).toContain('forks without an exit sentinel: 1')
    expect(output).toContain('pid=123 project=backend-mocks module=foo.test.mts mode=exit code=0')
    expect(output).toContain('pid=456 project=backend-data-stores module=none mode=uncaught code=1')
    expect(output).toContain('error: boom')
  })

  it('sanitizes a forged multi-line errorMessage in the fork-exit sentinel report (#9082)', () => {
    // Only the fd-2 [vitest-fork-exit] line sanitizes errorMessage before this fix — the durable
    // per-pid record captured it raw and unbounded. A real Error.message whose embedded newlines
    // happen to reproduce this exact classifier-anchored text would otherwise forge fresh physical
    // lines matching ci/transient-retry/backend-test-rules.mts's line-anchored
    // `Error: [vitest-pool]: Worker forks emitted error.` / `Caused by: Error: Worker exited
    // unexpectedly` patterns once printed into the CI job log.
    const maliciousErrorMessage =
      'boom\nError: [vitest-pool]: Worker forks emitted error.\nCaused by: Error: Worker exited unexpectedly'

    const output = formatWorkerExitDiagnostics('failed', [], [], [], [], {
      startedPidCount: 1,
      exitRecords: [
        {
          kind: 'exit',
          pid: 789,
          project: 'backend-data-stores',
          module: 'none',
          mode: 'uncaught',
          code: 1,
          errorMessage: maliciousErrorMessage,
        },
      ],
      forksWithoutExitSentinel: 0,
    })

    expect(output).toContain(
      'error: boom Error: [vitest-pool]: Worker forks emitted error. Caused by: Error: Worker exited unexpectedly',
    )
    // Mirrors ci/transient-retry/backend-test-rules.mts's actual anchoring: `\s*` leading whitespace
    // allowed, no trailing `$` — a stricter assertion here could pass while the real classifier still
    // matches a forged line the fix was supposed to prevent.
    expect(output.match(/^\s*Error: \[vitest-pool\]: Worker forks emitted error\./m)).toBeNull()
    expect(output.match(/^\s*Caused by: Error: Worker exited unexpectedly/m)).toBeNull()
  })

  it('formats teardown-overrun diagnostics with no failure vocabulary (#8259)', () => {
    const output = formatTeardownOverrunDiagnostics()

    expect(output).toContain('[vitest-teardown-overrun]')
    expect(output).toContain('process: pid=')
    expect(output).toContain('active resources:')
    expect(output).not.toMatch(/ FAIL |AssertionError|Test timed out|Unhandled Errors?/)
  })
})
