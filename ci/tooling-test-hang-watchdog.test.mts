import { describe, expect, it } from 'vitest'
import {
  recordToolingHangOutput,
  shouldKillToolingHang,
  startToolingHangWatchdog,
  TOOLING_HANG_GRACE_MS,
  TOOLING_HANG_WALL_CLOCK_MS,
  TOOLING_TEARDOWN_TIMEOUT_MS,
  type ToolingHangWatchdogState,
} from './tooling-test-hang-watchdog.mts'

function state(overrides: Partial<ToolingHangWatchdogState> = {}): ToolingHangWatchdogState {
  return {
    coverageEnabled: false,
    lastOutputAt: 0,
    pendingByStream: { stderr: '', stdout: '' },
    sawRunSummary: false,
    startedAt: 0,
    terminateWorkerAt: null,
    wallClock: false,
    ...overrides,
  }
}

describe('tooling hang watchdog', () => {
  it('does not kill after a per-file summary while output continues', () => {
    const next = recordToolingHangOutput(
      state(),
      ' ✓ ci/setup-web-integration.mock.test.mts (8 tests) 12ms\n',
      1_000,
      'stdout',
    )
    expect(next.sawRunSummary).toBe(false)
    expect(
      shouldKillToolingHang(next, 1_000 + TOOLING_TEARDOWN_TIMEOUT_MS + TOOLING_HANG_GRACE_MS),
    ).toBe(false)
  })

  it('kills after a terminate-worker line plus grace', () => {
    const next = recordToolingHangOutput(
      state({ lastOutputAt: 5_000 }),
      '[vitest-pool]: Timeout terminating threads worker for test files route-selector-map.test.mts.\n',
      90_000,
      'stderr',
    )
    expect(next.terminateWorkerAt).toBe(90_000)
    expect(shouldKillToolingHang(next, 90_000 + TOOLING_HANG_GRACE_MS - 1)).toBe(false)
    expect(shouldKillToolingHang(next, 90_000 + TOOLING_HANG_GRACE_MS)).toBe(true)
  })

  it('matches terminate-worker text split across chunks', () => {
    const first = recordToolingHangOutput(
      state(),
      '[vitest-pool]: Timeout terminating th',
      90_000,
      'stderr',
    )
    expect(first.terminateWorkerAt).toBeNull()
    const next = recordToolingHangOutput(
      first,
      'reads worker for test files foo.mts.\n',
      90_100,
      'stderr',
    )
    expect(next.terminateWorkerAt).toBe(90_100)
  })

  it('matches a terminate-worker marker split around an interleaved stdout chunk', () => {
    const first = recordToolingHangOutput(state(), 'Timeout terminating ', 90_000, 'stderr')
    expect(first.terminateWorkerAt).toBeNull()
    const mid = recordToolingHangOutput(first, 'progress\n', 90_050, 'stdout')
    expect(mid.terminateWorkerAt).toBeNull()
    expect(mid.pendingByStream.stderr).toBe('Timeout terminating ')
    expect(mid.lastOutputAt).toBe(90_050)
    const next = recordToolingHangOutput(mid, 'forks worker\n', 90_100, 'stderr')
    expect(next.terminateWorkerAt).toBe(90_100)
  })

  it('matches a run-summary marker split around an interleaved stderr chunk', () => {
    const first = recordToolingHangOutput(state(), ' Test Files  ', 95_000, 'stdout')
    expect(first.sawRunSummary).toBe(false)
    const mid = recordToolingHangOutput(first, 'pool noise\n', 95_050, 'stderr')
    expect(mid.sawRunSummary).toBe(false)
    expect(mid.pendingByStream.stdout).toBe(' Test Files  ')
    const next = recordToolingHangOutput(mid, '1 failed | 721 passed (722)\n', 95_100, 'stdout')
    expect(next.sawRunSummary).toBe(true)
  })

  it('kills after a Vitest run summary then teardownTimeout plus grace of silence', () => {
    const next = recordToolingHangOutput(
      state({ lastOutputAt: 80_000 }),
      ' Test Files  1 failed | 721 passed (722)\n',
      95_000,
      'stdout',
    )
    expect(next.sawRunSummary).toBe(true)
    expect(
      shouldKillToolingHang(next, 95_000 + TOOLING_TEARDOWN_TIMEOUT_MS + TOOLING_HANG_GRACE_MS - 1),
    ).toBe(false)
    expect(
      shouldKillToolingHang(next, 95_000 + TOOLING_TEARDOWN_TIMEOUT_MS + TOOLING_HANG_GRACE_MS),
    ).toBe(true)
  })

  it('does not arm summary silence while coverage is still writing', () => {
    const next = recordToolingHangOutput(
      state({ coverageEnabled: true }),
      ' Test Files  1 failed | 721 passed (722)\n',
      95_000,
      'stdout',
    )
    expect(
      shouldKillToolingHang(next, 95_000 + TOOLING_TEARDOWN_TIMEOUT_MS + TOOLING_HANG_GRACE_MS),
    ).toBe(false)
  })

  it('kills at the wall-clock cap only when the CI wall clock is armed', () => {
    expect(TOOLING_HANG_WALL_CLOCK_MS).toBeLessThan(8 * 60_000)
    expect(shouldKillToolingHang(state(), TOOLING_HANG_WALL_CLOCK_MS)).toBe(false)
    expect(shouldKillToolingHang(state({ wallClock: true }), TOOLING_HANG_WALL_CLOCK_MS)).toBe(true)
  })

  it('SIGKILLs the process group after a terminate-worker line plus grace', () => {
    let now = 0
    const killed: Array<{ pid: number; signal: NodeJS.Signals }> = []
    const stderr: string[] = []
    let interval: (() => void) | undefined
    const watchdog = startToolingHangWatchdog(2309074, {
      now: () => now,
      setInterval: (callback: () => void) => {
        interval = callback
        return 1
      },
      clearInterval: () => {
        interval = undefined
      },
      killProcessGroup: (pid, signal) => {
        killed.push({ pid, signal })
      },
      stderr: {
        write: chunk => {
          stderr.push(String(chunk))
          return true
        },
      },
    })
    watchdog.onOutput('[vitest-pool]: Timeout terminating threads worker\n', 'stderr')
    now = TOOLING_HANG_GRACE_MS
    interval?.()
    expect(killed).toEqual([{ pid: 2309074, signal: 'SIGKILL' }])
    expect(stderr.join('')).toContain('[vitest-teardown-overrun]')
    watchdog.stop()
  })
})
