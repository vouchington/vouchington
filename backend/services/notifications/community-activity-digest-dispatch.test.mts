import { describe, expect, it } from 'vitest'
import {
  expireTestCommunityActivityDigestWorkItemLease,
  getTestCommunityActivityDigestWorkItems,
  insertTestCommunityActivityDigestWorkItem,
  readNextTestCommunityActivityDigestWindowStart,
  withTestCommunityActivityDigestLock,
} from '@voucha/test-helpers'
import {
  completeCommunityActivityDigestWorkItem,
  claimCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
  renewCommunityActivityDigestWorkItem,
  releaseCommunityActivityDigestWorkItem,
} from './community-activity-digest-dispatch.mts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function addWeeks(start: Date, weeks: number): Date {
  return new Date(start.getTime() + weeks * WEEK_MS)
}

function iso(start: Date): string {
  return start.toISOString()
}

describe('community activity digest work items', () => {
  it('initializes and fills ordered gaps while retaining the completed high-water mark', async () => {
    await withTestCommunityActivityDigestLock(async () => {
      const firstStart = await readNextTestCommunityActivityDigestWindowStart()
      const foreignStart = new Date(firstStart.getTime() - 3 * 24 * 60 * 60 * 1000)
      const firstEnd = addWeeks(firstStart, 1)
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]),
      ).resolves.toEqual([{ windowStart: firstStart, windowEnd: firstEnd }])
      await insertTestCommunityActivityDigestWorkItem(foreignStart)
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart, foreignStart]),
      ).resolves.toEqual([
        { windowStart: foreignStart, windowEnd: addWeeks(foreignStart, 1) },
        { windowStart: firstStart, windowEnd: firstEnd },
      ])
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]),
      ).resolves.toEqual([{ windowStart: firstStart, windowEnd: firstEnd }])
      const leaseToken = await claimCommunityActivityDigestWorkItem(firstStart)
      expect(leaseToken).toBeTypeOf('string')
      if (!leaseToken) throw new Error('Expected a digest lease')
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]),
      ).resolves.toEqual([])
      await expect(completeCommunityActivityDigestWorkItem(firstStart, leaseToken)).resolves.toBe(
        true,
      )
      const owned = [addWeeks(firstStart, 1), addWeeks(firstStart, 2), addWeeks(firstStart, 3)]
      const pending = await prepareCommunityActivityDigestWorkItems(owned[2]!, owned)
      expect(pending.map(window => iso(window.windowStart))).toEqual(owned.map(iso))
      const stored = await getTestCommunityActivityDigestWorkItems()
      const ownedStarts = new Set([iso(firstStart), ...owned.map(iso)])
      expect(stored.filter(row => ownedStarts.has(iso(row.window_starts_at)))).toHaveLength(4)
      expect(stored.find(row => iso(row.window_starts_at) === iso(foreignStart))).toMatchObject({
        completed_at: null,
        attempt_count: 0,
      })
    })
  })

  it('fences stale batch chains after expiry and successor takeover', async () => {
    await withTestCommunityActivityDigestLock(async () => {
      const windowStart = await readNextTestCommunityActivityDigestWindowStart()
      const foreignStart = new Date(windowStart.getTime() - 3 * 24 * 60 * 60 * 1000)
      await prepareCommunityActivityDigestWorkItems(windowStart, [windowStart])
      await insertTestCommunityActivityDigestWorkItem(foreignStart)
      const firstToken = await claimCommunityActivityDigestWorkItem(windowStart)
      if (!firstToken) throw new Error('Expected first digest lease')
      await expect(claimCommunityActivityDigestWorkItem(windowStart)).resolves.toBeNull()
      await expireTestCommunityActivityDigestWorkItemLease(windowStart, firstToken)
      const successorToken = await claimCommunityActivityDigestWorkItem(windowStart)
      if (!successorToken) throw new Error('Expected successor digest lease')
      expect(successorToken).not.toBe(firstToken)
      await releaseCommunityActivityDigestWorkItem(windowStart, firstToken)
      await expect(renewCommunityActivityDigestWorkItem(windowStart, firstToken)).resolves.toBe(
        false,
      )
      await expect(completeCommunityActivityDigestWorkItem(windowStart, firstToken)).resolves.toBe(
        false,
      )
      await expect(renewCommunityActivityDigestWorkItem(windowStart, successorToken)).resolves.toBe(
        true,
      )
      await expect(
        completeCommunityActivityDigestWorkItem(windowStart, successorToken),
      ).resolves.toBe(true)
      await expect(
        prepareCommunityActivityDigestWorkItems(windowStart, [windowStart, foreignStart]),
      ).resolves.toEqual([{ windowStart: foreignStart, windowEnd: addWeeks(foreignStart, 1) }])
    })
  })
})
