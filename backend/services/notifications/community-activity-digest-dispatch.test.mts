import { overrideDynamicConfigFieldsForTest } from '../../test-helpers/dynamic-config.mts'
import { notificationsWorkConfig } from './work-limits.mts'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  addTestCommunityActivityDigestWeeks as unownedAddTestCommunityActivityDigestWeeks,
  expireTestCommunityActivityDigestWorkItemLease as unownedExpireTestCommunityActivityDigestWorkItemLease,
  getTestCommunityActivityDigestWorkItems as unownedGetTestCommunityActivityDigestWorkItems,
  insertTestCommunityActivityDigestWorkItem as unownedInsertTestCommunityActivityDigestWorkItem,
  readNextTestCommunityActivityDigestWindowStart as unownedReadNextTestCommunityActivityDigestWindowStart,
  withTestCommunityActivityDigestLock,
} from '@voucha/test-helpers'
import {
  completeCommunityActivityDigestWorkItem as unownedCompleteCommunityActivityDigestWorkItem,
  claimCommunityActivityDigestWorkItem as unownedClaimCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems as unownedPrepareCommunityActivityDigestWorkItems,
  renewCommunityActivityDigestWorkItem as unownedRenewCommunityActivityDigestWorkItem,
  releaseCommunityActivityDigestWorkItem as unownedReleaseCommunityActivityDigestWorkItem,
} from './community-activity-digest-dispatch.mts'

function iso(start: Date): string {
  return start.toISOString()
}

describe('community activity digest work items', () => {
  it('initializes and fills ordered gaps while retaining the completed high-water mark', async () => {
    await withTestCommunityActivityDigestLock(async owner => {
      const addTestCommunityActivityDigestWeeks = owner.operation(
        unownedAddTestCommunityActivityDigestWeeks,
      )
      const getTestCommunityActivityDigestWorkItems = owner.operation(
        unownedGetTestCommunityActivityDigestWorkItems,
      )
      const insertTestCommunityActivityDigestWorkItem = owner.operation(
        unownedInsertTestCommunityActivityDigestWorkItem,
      )
      const readNextTestCommunityActivityDigestWindowStart = owner.operation(
        unownedReadNextTestCommunityActivityDigestWindowStart,
      )
      const completeCommunityActivityDigestWorkItem = owner.operation(
        unownedCompleteCommunityActivityDigestWorkItem,
      )
      const claimCommunityActivityDigestWorkItem = owner.operation(
        unownedClaimCommunityActivityDigestWorkItem,
      )
      const prepareCommunityActivityDigestWorkItems = owner.operation(
        unownedPrepareCommunityActivityDigestWorkItems,
      )
      const firstStart = await readNextTestCommunityActivityDigestWindowStart()
      const foreignStart = new Date(firstStart.getTime() - 3 * 24 * 60 * 60 * 1000)
      const firstEnd = await addTestCommunityActivityDigestWeeks(firstStart, 1)
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]).then(
          result => result.windows,
        ),
      ).resolves.toEqual([{ windowStart: firstStart, windowEnd: firstEnd }])
      await insertTestCommunityActivityDigestWorkItem(foreignStart)
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart, foreignStart]).then(
          result => result.windows,
        ),
      ).resolves.toEqual([
        {
          windowStart: foreignStart,
          windowEnd: await addTestCommunityActivityDigestWeeks(foreignStart, 1),
        },
        { windowStart: firstStart, windowEnd: firstEnd },
      ])
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]).then(
          result => result.windows,
        ),
      ).resolves.toEqual([{ windowStart: firstStart, windowEnd: firstEnd }])
      const leaseToken = await claimCommunityActivityDigestWorkItem(firstStart)
      expect(leaseToken).toBeTypeOf('string')
      if (!leaseToken) throw new Error('Expected a digest lease')
      await expect(
        prepareCommunityActivityDigestWorkItems(firstStart, [firstStart]).then(
          result => result.windows,
        ),
      ).resolves.toEqual([])
      await expect(completeCommunityActivityDigestWorkItem(firstStart, leaseToken)).resolves.toBe(
        true,
      )
      const owned = await Promise.all(
        [1, 2, 3].map(weeks => addTestCommunityActivityDigestWeeks(firstStart, weeks)),
      )
      const pending = await prepareCommunityActivityDigestWorkItems(owned[2]!, owned)
      expect(pending.windows.map(window => iso(window.windowStart))).toEqual(owned.map(iso))
      const stored = await getTestCommunityActivityDigestWorkItems()
      const ownedStarts = new Set([iso(firstStart), ...owned.map(iso)])
      expect(stored.filter(row => ownedStarts.has(iso(row.window_starts_at)))).toHaveLength(4)
      expect(stored.find(row => iso(row.window_starts_at) === iso(foreignStart))).toMatchObject({
        completed_at: null,
        attempt_count: 0,
      })
    })
  })

  it('caps catch-up creation and pending dispatch while preserving weekly continuation', async () => {
    const restore = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      community_digest_window_batch_size: 2,
    })
    onTestFinished(restore)
    await withTestCommunityActivityDigestLock(async owner => {
      const addTestCommunityActivityDigestWeeks = owner.operation(
        unownedAddTestCommunityActivityDigestWeeks,
      )
      const insertTestCommunityActivityDigestWorkItem = owner.operation(
        unownedInsertTestCommunityActivityDigestWorkItem,
      )
      const readNextTestCommunityActivityDigestWindowStart = owner.operation(
        unownedReadNextTestCommunityActivityDigestWindowStart,
      )
      const completeCommunityActivityDigestWorkItem = owner.operation(
        unownedCompleteCommunityActivityDigestWorkItem,
      )
      const claimCommunityActivityDigestWorkItem = owner.operation(
        unownedClaimCommunityActivityDigestWorkItem,
      )
      const prepareCommunityActivityDigestWorkItems = owner.operation(
        unownedPrepareCommunityActivityDigestWorkItems,
      )
      const first = await readNextTestCommunityActivityDigestWindowStart()
      await insertTestCommunityActivityDigestWorkItem(first)
      const starts = await Promise.all(
        [1, 2, 3, 4, 5].map(weeks => addTestCommunityActivityDigestWeeks(first, weeks)),
      )
      const firstPage = await prepareCommunityActivityDigestWorkItems(starts[4]!, starts)
      expect(firstPage.hasMore).toBe(true)
      expect(firstPage.windows.map(window => window.windowStart)).toEqual(starts.slice(0, 2))
      const secondPage = await prepareCommunityActivityDigestWorkItems(starts[4]!, starts)
      expect(secondPage.windows).toHaveLength(2)
      expect(secondPage.hasMore).toBe(true)
      // Pending listings remain bounded even when creation has advanced to the target.
      const thirdPage = await prepareCommunityActivityDigestWorkItems(starts[4]!, starts)
      expect(thirdPage.windows).toHaveLength(2)
      expect(thirdPage.hasMore).toBe(true)
      for (const start of starts.slice(0, 4)) {
        const token = await claimCommunityActivityDigestWorkItem(start)
        if (!token) throw new Error('Expected owned digest lease')
        await completeCommunityActivityDigestWorkItem(start, token)
      }
      const lastPage = await prepareCommunityActivityDigestWorkItems(starts[4]!, starts)
      expect(lastPage.hasMore).toBe(false)
      expect(lastPage.windows).toEqual([
        {
          windowStart: starts[4],
          windowEnd: await addTestCommunityActivityDigestWeeks(starts[4]!, 1),
        },
      ])
    })
  })

  it('fences stale batch chains after expiry and successor takeover', async () => {
    await withTestCommunityActivityDigestLock(async owner => {
      const addTestCommunityActivityDigestWeeks = owner.operation(
        unownedAddTestCommunityActivityDigestWeeks,
      )
      const expireTestCommunityActivityDigestWorkItemLease = owner.operation(
        unownedExpireTestCommunityActivityDigestWorkItemLease,
      )
      const insertTestCommunityActivityDigestWorkItem = owner.operation(
        unownedInsertTestCommunityActivityDigestWorkItem,
      )
      const readNextTestCommunityActivityDigestWindowStart = owner.operation(
        unownedReadNextTestCommunityActivityDigestWindowStart,
      )
      const completeCommunityActivityDigestWorkItem = owner.operation(
        unownedCompleteCommunityActivityDigestWorkItem,
      )
      const claimCommunityActivityDigestWorkItem = owner.operation(
        unownedClaimCommunityActivityDigestWorkItem,
      )
      const prepareCommunityActivityDigestWorkItems = owner.operation(
        unownedPrepareCommunityActivityDigestWorkItems,
      )
      const renewCommunityActivityDigestWorkItem = owner.operation(
        unownedRenewCommunityActivityDigestWorkItem,
      )
      const releaseCommunityActivityDigestWorkItem = owner.operation(
        unownedReleaseCommunityActivityDigestWorkItem,
      )
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
        prepareCommunityActivityDigestWorkItems(windowStart, [windowStart, foreignStart]).then(
          result => result.windows,
        ),
      ).resolves.toEqual([
        {
          windowStart: foreignStart,
          windowEnd: await addTestCommunityActivityDigestWeeks(foreignStart, 1),
        },
      ])
    })
  })
})
