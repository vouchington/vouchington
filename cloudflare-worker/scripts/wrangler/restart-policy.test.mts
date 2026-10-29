import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RESTARTS,
  burstAttemptNumber,
  formatWranglerRestartMessage,
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

  it('defaults stableUptimeMs to the module-level STABLE_UPTIME_MS', () => {
    expect(burstAttemptNumber(0, 100)).toBe(1)
  })
})

describe('formatWranglerRestartMessage', () => {
  it('formats the attempt/max marker used in stderr', () => {
    expect(formatWranglerRestartMessage(2, MAX_RESTARTS)).toBe(
      'start-wrangler: restarting wrangler (attempt 2/5)',
    )
  })
})

describe('configured stable uptime behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([
    [undefined, 60_000],
    ['2000', 2_000],
    ['not-a-number', 60_000],
    ['0', 60_000],
    ['-500', 60_000],
  ])('uses the stable uptime setting %s', async (value, expected) => {
    vi.stubEnv('WRANGLER_STABLE_UPTIME_MS', value)
    vi.resetModules()

    const policy = await import('./restart-policy.mts')
    expect(policy.STABLE_UPTIME_MS).toBe(expected)
    expect(policy.burstAttemptNumber(2, 2_000)).toBe(expected === 2_000 ? 1 : 3)
  })
})
