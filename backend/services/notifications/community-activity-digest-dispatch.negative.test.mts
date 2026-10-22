import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  deleteOwnedTestCommunityActivityDigestWorkItem as unownedDeleteOwnedTestCommunityActivityDigestWorkItem,
  insertTestCommunityActivityDigestWorkItem as unownedInsertTestCommunityActivityDigestWorkItem,
  readNextTestCommunityActivityDigestWindowStart as unownedReadNextTestCommunityActivityDigestWindowStart,
  readTestCommunityActivityDigestWorkItem as unownedReadTestCommunityActivityDigestWorkItem,
  withTestCommunityActivityDigestLock,
} from '@voucha/test-helpers'
import {
  claimCommunityActivityDigestWorkItem as unownedClaimCommunityActivityDigestWorkItem,
  completeCommunityActivityDigestWorkItem as unownedCompleteCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems as unownedPrepareCommunityActivityDigestWorkItems,
  releaseCommunityActivityDigestWorkItem as unownedReleaseCommunityActivityDigestWorkItem,
} from './community-activity-digest-dispatch.mts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

describe('community activity digest shared-database negatives', () => {
  it('keeps the real lease when release is given a different token', async () => {
    await withTestCommunityActivityDigestLock(async owner => {
      const readNextTestCommunityActivityDigestWindowStart = owner.operation(
        unownedReadNextTestCommunityActivityDigestWindowStart,
      )
      const readTestCommunityActivityDigestWorkItem = owner.operation(
        unownedReadTestCommunityActivityDigestWorkItem,
      )
      const claimCommunityActivityDigestWorkItem = owner.operation(
        unownedClaimCommunityActivityDigestWorkItem,
      )
      const prepareCommunityActivityDigestWorkItems = owner.operation(
        unownedPrepareCommunityActivityDigestWorkItems,
      )
      const releaseCommunityActivityDigestWorkItem = owner.operation(
        unownedReleaseCommunityActivityDigestWorkItem,
      )
      const windowStart = await readNextTestCommunityActivityDigestWindowStart()
      await prepareCommunityActivityDigestWorkItems(windowStart, [windowStart])
      const leaseToken = await claimCommunityActivityDigestWorkItem(windowStart)
      expect(leaseToken).toBeTypeOf('string')
      if (!leaseToken) throw new Error('Expected a digest lease')
      await releaseCommunityActivityDigestWorkItem(windowStart, randomUUID())
      await expect(readTestCommunityActivityDigestWorkItem(windowStart)).resolves.toMatchObject({
        lease_token: leaseToken,
        attempt_count: 1,
        completed_at: null,
      })
      await releaseCommunityActivityDigestWorkItem(windowStart, leaseToken)
      await expect(readTestCommunityActivityDigestWorkItem(windowStart)).resolves.toMatchObject({
        lease_token: null,
        attempt_count: 1,
        completed_at: null,
      })
    })
  })

  it('deletes only the owned uncompleted window', async () => {
    await withTestCommunityActivityDigestLock(async owner => {
      const deleteOwnedTestCommunityActivityDigestWorkItem = owner.operation(
        unownedDeleteOwnedTestCommunityActivityDigestWorkItem,
      )
      const insertTestCommunityActivityDigestWorkItem = owner.operation(
        unownedInsertTestCommunityActivityDigestWorkItem,
      )
      const readNextTestCommunityActivityDigestWindowStart = owner.operation(
        unownedReadNextTestCommunityActivityDigestWindowStart,
      )
      const readTestCommunityActivityDigestWorkItem = owner.operation(
        unownedReadTestCommunityActivityDigestWorkItem,
      )
      const claimCommunityActivityDigestWorkItem = owner.operation(
        unownedClaimCommunityActivityDigestWorkItem,
      )
      const completeCommunityActivityDigestWorkItem = owner.operation(
        unownedCompleteCommunityActivityDigestWorkItem,
      )
      const prepareCommunityActivityDigestWorkItems = owner.operation(
        unownedPrepareCommunityActivityDigestWorkItems,
      )
      const completedStart = await readNextTestCommunityActivityDigestWindowStart()
      const ownedStart = new Date(completedStart.getTime() + WEEK_MS)
      await prepareCommunityActivityDigestWorkItems(completedStart, [completedStart])
      const leaseToken = await claimCommunityActivityDigestWorkItem(completedStart)
      if (!leaseToken) throw new Error('Expected a digest lease')
      await expect(
        completeCommunityActivityDigestWorkItem(completedStart, leaseToken),
      ).resolves.toBe(true)
      await insertTestCommunityActivityDigestWorkItem(ownedStart)
      await expect(readTestCommunityActivityDigestWorkItem(ownedStart)).resolves.toMatchObject({
        lease_token: null,
        completed_at: null,
        attempt_count: 0,
      })
      await expect(deleteOwnedTestCommunityActivityDigestWorkItem(completedStart)).resolves.toBe(
        false,
      )
      const retained = await readTestCommunityActivityDigestWorkItem(completedStart)
      expect(retained?.completed_at).toBeInstanceOf(Date)
      expect(retained).toMatchObject({ lease_token: null, attempt_count: 1 })
      await expect(deleteOwnedTestCommunityActivityDigestWorkItem(ownedStart)).resolves.toBe(true)
      await expect(readTestCommunityActivityDigestWorkItem(ownedStart)).resolves.toBeNull()
      await expect(readTestCommunityActivityDigestWorkItem(completedStart)).resolves.toMatchObject({
        completed_at: retained?.completed_at,
        lease_token: null,
        attempt_count: 1,
      })
    })
  })
})
