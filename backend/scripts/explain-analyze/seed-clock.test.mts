import { describe, expect, it, vi } from 'vitest'
import { buildTimeRangeFilter } from '@modules/feed-query-builders'
import { withSeedAnchorClock } from './seed-clock.mts'

const ANCHOR_MS = Date.UTC(2026, 9, 17, 12)

describe('withSeedAnchorClock', () => {
  it('pins Date to noon UTC on the seed anchor day, whatever the wall clock says', async () => {
    vi.stubEnv('EXPLAIN_SEED_ANCHOR_DATE', '2026-10-17')
    const seen = await withSeedAnchorClock(async () => {
      await Promise.resolve()
      return [Date.now(), Date.now()]
    })
    expect(seen).toEqual([ANCHOR_MS, ANCHOR_MS])
  })

  it('gives time-range filters one anchor-derived cutoff', async () => {
    vi.stubEnv('EXPLAIN_SEED_ANCHOR_DATE', '2026-10-17')
    const first = await withSeedAnchorClock(async () => buildTimeRangeFilter('1w', 'posts.id'))
    await new Promise<void>(resolve => setImmediate(resolve))
    const second = await withSeedAnchorClock(async () => buildTimeRangeFilter('1w', 'posts.id'))
    expect(first?.values).toEqual(second?.values)
    const cutoffTimestampHex = String(first?.values[0]).replace('-', '').slice(0, 12)
    expect(Number.parseInt(cutoffTimestampHex, 16)).toBe(ANCHOR_MS - 7 * 86_400_000)
  })

  it('restores the clock after the callback throws', async () => {
    vi.stubEnv('EXPLAIN_SEED_ANCHOR_DATE', '2026-10-17')
    await expect(
      withSeedAnchorClock(async () => {
        throw new Error('scenario failed')
      }),
    ).rejects.toThrow('scenario failed')
    expect(Date.now()).not.toBe(ANCHOR_MS)
  })
})
