import { describe, expect, it } from 'vitest'
import {
  MAX_RESTARTS,
  burstAttemptNumber,
  formatWranglerRestartMessage,
  readStableUptimeMs,
  WRANGLER_RESTART_MARKER_PREFIX,
} from './restart-policy.mts'

const STABLE = 60_000

describe('burstAttemptNumber', () => {
  it('accumulates across a burst of rapid crashes', () => {
    let attempt = 0
    for (const expected of [1, 2, 3, 4, 5]) {
      attempt = burstAttemptNumber(attempt, 500, STABLE)
      expect(attempt).toBe(expected)
    }
  })

  it('resets to 1 when the previous attempt survived the stable-uptime window', () => {
    expect(burstAttemptNumber(4, STABLE, STABLE)).toBe(1)
    expect(burstAttemptNumber(4, STABLE + 10_000, STABLE)).toBe(1)
  })

  it('resets to 1 regardless of how large the previous attempt was', () => {
    expect(burstAttemptNumber(MAX_RESTARTS, STABLE, STABLE)).toBe(1)
    expect(burstAttemptNumber(0, STABLE, STABLE)).toBe(1)
  })

  it('treats an attempt just under the window as still-rapid', () => {
    expect(burstAttemptNumber(2, STABLE - 1, STABLE)).toBe(3)
  })

  // The case that distinguishes fresh-incident semantics (a stable-separated crash costs one slot
  // of its own burst) from reset-to-zero semantics (a stable-separated crash costs nothing). One
  // stable crash followed by five rapid crashes must exhaust on the fifth rapid crash -- i.e. reach
  // MAX_RESTARTS + 1 -- not the sixth.
  it('exhausts a burst that starts with a stable-separated crash exactly like a pure rapid burst', () => {
    let attempt = burstAttemptNumber(3, STABLE, STABLE) // the stable-separated crash itself
    expect(attempt).toBe(1)

    const rapidAttempts: number[] = []
    for (let i = 0; i < 5; i++) {
      attempt = burstAttemptNumber(attempt, 500, STABLE)
      rapidAttempts.push(attempt)
    }

    expect(rapidAttempts).toEqual([2, 3, 4, 5, 6])
    expect(rapidAttempts.at(-1)).toBe(MAX_RESTARTS + 1)
  })

  it('never exceeds attempt 1 across an unbroken run of stable-separated crashes', () => {
    let attempt = 0
    for (let i = 0; i < 10; i++) {
      attempt = burstAttemptNumber(attempt, STABLE, STABLE)
      expect(attempt).toBe(1)
    }
  })

  it('defaults stableUptimeMs to the module-level STABLE_UPTIME_MS', () => {
    expect(burstAttemptNumber(0, 100)).toBe(1)
  })
})

describe('readStableUptimeMs', () => {
  it('defaults to 60s when unset', () => {
    expect(readStableUptimeMs({})).toBe(60_000)
  })

  it('honors a positive numeric override', () => {
    expect(readStableUptimeMs({ WRANGLER_STABLE_UPTIME_MS: '2000' })).toBe(2000)
  })

  it('falls back to the default for a non-numeric override', () => {
    expect(readStableUptimeMs({ WRANGLER_STABLE_UPTIME_MS: 'not-a-number' })).toBe(60_000)
  })

  it('falls back to the default for a zero or negative override', () => {
    expect(readStableUptimeMs({ WRANGLER_STABLE_UPTIME_MS: '0' })).toBe(60_000)
    expect(readStableUptimeMs({ WRANGLER_STABLE_UPTIME_MS: '-500' })).toBe(60_000)
  })
})

describe('formatWranglerRestartMessage', () => {
  it('formats the attempt/max marker used in stderr', () => {
    expect(formatWranglerRestartMessage(2, MAX_RESTARTS)).toBe(
      `${WRANGLER_RESTART_MARKER_PREFIX} (attempt 2/${MAX_RESTARTS})`,
    )
  })
})
