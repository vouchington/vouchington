import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'

import {
  createTestUserDirect,
  insertAnonymousReferralAttributionForSessionAt,
  insertReferralAttributionAt,
  clearReferralAttributionUserId,
  referralAttributionExistsById,
  createTestRetentionWindow,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

import { cleanupOldReferralAttributions } from '../cleanup.mts'

const DAY_MS = 24 * 60 * 60 * 1000
// Namespaced far enough into the future that this test's own rows can't collide with
// concurrently-running tests or dirty-DB rows from real traffic — same trick as
// createTestRetentionWindow, but retentionDays is deliberately omitted below so the
// service's own default applies.
const DEFAULT_WINDOW_FUTURE_OFFSET_DAYS = 50_000
const DEFAULT_WINDOW_NAMESPACE_DAYS = 365_000

describe('cleanupOldReferralAttributions', () => {
  it('defaults to a 30-day retention window when retentionDays is not provided', async () => {
    // Pins the 365 -> 30 day change from #8750; a revert to 365 must turn this red.
    const namespaceOffsetMs = crypto.randomInt(DEFAULT_WINDOW_NAMESPACE_DAYS) * DAY_MS
    const now = new Date(
      Date.now() + DEFAULT_WINDOW_FUTURE_OFFSET_DAYS * DAY_MS + namespaceOffsetMs,
    )
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    // Younger than the 30-day cutoff: must survive under both 30 and 365.
    const survivingId = await insertReferralAttributionAt(
      referrer.id,
      new Date(now.getTime() - 29 * DAY_MS),
    )
    // Older than a 30-day cutoff but younger than a 365-day one: only the 30-day default
    // sweeps this row, so its survival would mean the default silently reverted to 365.
    const sweptId = await insertReferralAttributionAt(
      referrer.id,
      new Date(now.getTime() - 40 * DAY_MS),
    )

    await cleanupOldReferralAttributions({
      now,
      lowerBoundDate: new Date(now.getTime() - 45 * DAY_MS),
    })

    expect(await referralAttributionExistsById(survivingId)).toBe(true)
    expect(await referralAttributionExistsById(sweptId)).toBe(false)
  }, 30_000)

  it('deletes anonymous referral attributions older than retentionDays', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    const oldId = await insertReferralAttributionAt(referrer.id, window.firstEligibleDate)

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await referralAttributionExistsById(oldId)).toBe(false)
  }, 30_000)

  it('does NOT delete recent anonymous referral attributions', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    const recentId = await insertReferralAttributionAt(referrer.id, window.afterUpperBoundDate)

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await referralAttributionExistsById(recentId)).toBe(true)
  }, 30_000)

  it('does NOT delete user-linked referral attributions regardless of age', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    const linkedUser = await createTestUserDirect()
    if (!referrer || !linkedUser) throw new Error('Failed to create test users')

    const oldLinkedId = await insertReferralAttributionAt(
      referrer.id,
      window.firstEligibleDate,
      linkedUser.id,
    )

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await referralAttributionExistsById(oldLinkedId)).toBe(true)
  }, 30_000)

  it('a re-clicked anonymous row (fresh id) survives even though its original click is old enough to be swept', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    const sessionId = v7()
    // The original click — eligible for deletion under this window.
    const originalId = await insertAnonymousReferralAttributionForSessionAt(
      sessionId,
      referrer.id,
      window.firstEligibleDate,
    )
    // A repeat click's move-to-latest dedup replaces it with a fresh id, minted after the sweep's
    // cutoff — see createSessionReferralAttribution.
    const movedId = await insertAnonymousReferralAttributionForSessionAt(
      sessionId,
      referrer.id,
      window.afterUpperBoundDate,
    )

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await referralAttributionExistsById(originalId)).toBe(false)
    expect(await referralAttributionExistsById(movedId)).toBe(true)
  }, 30_000)

  it('sweeps a converted row once its user_id has been nulled out (e.g. by account deletion)', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    const convertedUser = await createTestUserDirect()
    if (!referrer || !convertedUser) throw new Error('Failed to create test users')

    const rowId = await insertReferralAttributionAt(
      referrer.id,
      window.firstEligibleDate,
      convertedUser.id,
      window.firstEligibleDate,
    )
    // deleteUser's ON DELETE SET NULL cascade nulls user_id, dropping a converted row back into
    // the anonymous sweep even though signed_up_at is still set.
    await clearReferralAttributionUserId(rowId)

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await referralAttributionExistsById(rowId)).toBe(false)
  }, 30_000)

  it('deletes old anonymous referral attributions in bounded batches', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    const firstOldId = await insertReferralAttributionAt(referrer.id, window.firstEligibleDate)
    const secondOldId = await insertReferralAttributionAt(referrer.id, window.secondEligibleDate)

    const firstResult = await cleanupOldReferralAttributions({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })
    const existsAfterFirstRun = [
      await referralAttributionExistsById(firstOldId),
      await referralAttributionExistsById(secondOldId),
    ]

    const secondResult = await cleanupOldReferralAttributions({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })

    expect(firstResult).toEqual({ deleted: 1, hasMore: true })
    expect(existsAfterFirstRun.filter(Boolean)).toHaveLength(1)
    expect(secondResult).toEqual({ deleted: 1, hasMore: true })
    expect(await referralAttributionExistsById(firstOldId)).toBe(false)
    expect(await referralAttributionExistsById(secondOldId)).toBe(false)
  }, 30_000)
})
