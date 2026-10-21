import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createRandomString,
  createTestRetentionWindow,
  createTestUserDirect,
  hardDeleteTestPosts,
  insertTestPostBatch,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactPostIds,
  getTestUserRaw,
  insertReferralAttributionAt,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  referralAttributionExistsById,
  setOAuthAccountCreatedAt,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import {
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
  cleanupSoftDeletedUsers,
} from './cleanup.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { cleanupSoftDeletedUser } from './cleanup-soft-deleted-user.mts'

const THIRTY_DAY_UTC_EDGES = [
  ['2025-01-31T23:59:59.999Z', '2025-01-01T23:59:59.999Z'],
  ['2025-02-01T00:00:00.001Z', '2025-01-02T00:00:00.001Z'],
  ['2024-02-29T23:59:59.999Z', '2024-01-30T23:59:59.999Z'],
  ['2024-03-01T00:00:00.001Z', '2024-01-31T00:00:00.001Z'],
  ['2025-12-31T23:59:59.999Z', '2025-12-01T23:59:59.999Z'],
  ['2026-01-01T00:00:00.001Z', '2025-12-02T00:00:00.001Z'],
] as const

describe('cleanup retention windows', () => {
  it.each(THIRTY_DAY_UTC_EDGES)(
    'maps a 30-day cutoff from %s to %s across UTC calendar edges',
    (now, cutoff) => {
      expect(getRetentionCutoffDate(30, new Date(now))).toEqual(new Date(cutoff))
    },
  )

  it('only deletes soft-deleted users inside the bounded retention window', async () => {
    const window = createTestRetentionWindow()
    const beforeLowerBoundUser = await createTestUserDirect()
    const firstEligibleUser = await createTestUserDirect()
    const secondEligibleUser = await createTestUserDirect()
    const atUpperBoundUser = await createTestUserDirect()
    const afterUpperBoundUser = await createTestUserDirect()
    if (
      !beforeLowerBoundUser ||
      !firstEligibleUser ||
      !secondEligibleUser ||
      !atUpperBoundUser ||
      !afterUpperBoundUser
    ) {
      throw new Error('Failed to create test users')
    }

    await softDeleteUserAt(beforeLowerBoundUser.id, window.beforeLowerBoundDate)
    await softDeleteUserAt(firstEligibleUser.id, window.firstEligibleDate)
    await softDeleteUserAt(secondEligibleUser.id, window.secondEligibleDate)
    await softDeleteUserAt(atUpperBoundUser.id, window.upperBoundDate)
    await softDeleteUserAt(afterUpperBoundUser.id, window.afterUpperBoundDate)

    const result = await cleanupSoftDeletedUsers(window)

    expect(result).toEqual({ deleted: 2, hasMore: false })
    expect(await getTestUserRaw(beforeLowerBoundUser.id)).not.toBeNull()
    expect(await getTestUserRaw(firstEligibleUser.id)).toBeNull()
    expect(await getTestUserRaw(secondEligibleUser.id)).toBeNull()
    expect(await getTestUserRaw(atUpperBoundUser.id)).not.toBeNull()
    expect(await getTestUserRaw(afterUpperBoundUser.id)).not.toBeNull()
  })

  it('only deletes anonymous referral attributions inside the bounded UUIDv7 window', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    if (!referrer) throw new Error('Failed to create referrer')

    const beforeLowerBoundId = await insertReferralAttributionAt(
      referrer.id,
      window.beforeLowerBoundDate,
    )
    const firstEligibleId = await insertReferralAttributionAt(referrer.id, window.firstEligibleDate)
    const secondEligibleId = await insertReferralAttributionAt(
      referrer.id,
      window.secondEligibleDate,
    )
    const atUpperBoundId = await insertReferralAttributionAt(referrer.id, window.upperBoundDate)
    const afterUpperBoundId = await insertReferralAttributionAt(
      referrer.id,
      window.afterUpperBoundDate,
    )

    const result = await cleanupOldReferralAttributions(window)

    expect(result).toEqual({ deleted: 2, hasMore: false })
    expect(await referralAttributionExistsById(beforeLowerBoundId)).toBe(true)
    expect(await referralAttributionExistsById(firstEligibleId)).toBe(false)
    expect(await referralAttributionExistsById(secondEligibleId)).toBe(false)
    expect(await referralAttributionExistsById(atUpperBoundId)).toBe(true)
    expect(await referralAttributionExistsById(afterUpperBoundId)).toBe(true)
  }, 30_000)

  it('only deletes orphaned OAuth accounts inside the bounded retention window', async () => {
    const window = createTestRetentionWindow()
    const beforeLowerBoundProviderUserId = `test-orphan-before-lower-${createRandomString(12)}`
    const firstEligibleProviderUserId = `test-orphan-first-${createRandomString(12)}`
    const secondEligibleProviderUserId = `test-orphan-second-${createRandomString(12)}`
    const atUpperBoundProviderUserId = `test-orphan-at-upper-${createRandomString(12)}`
    const afterUpperBoundProviderUserId = `test-orphan-after-upper-${createRandomString(12)}`

    await insertTestOAuthAccount('github', beforeLowerBoundProviderUserId)
    await insertTestOAuthAccount('github', firstEligibleProviderUserId)
    await insertTestOAuthAccount('github', secondEligibleProviderUserId)
    await insertTestOAuthAccount('github', atUpperBoundProviderUserId)
    await insertTestOAuthAccount('github', afterUpperBoundProviderUserId)
    await setOAuthAccountCreatedAt(
      'github',
      beforeLowerBoundProviderUserId,
      window.beforeLowerBoundDate,
    )
    await setOAuthAccountCreatedAt('github', firstEligibleProviderUserId, window.firstEligibleDate)
    await setOAuthAccountCreatedAt(
      'github',
      secondEligibleProviderUserId,
      window.secondEligibleDate,
    )
    await setOAuthAccountCreatedAt('github', atUpperBoundProviderUserId, window.upperBoundDate)
    await setOAuthAccountCreatedAt(
      'github',
      afterUpperBoundProviderUserId,
      window.afterUpperBoundDate,
    )

    const result = await cleanupOrphanedOAuthAccounts(window)

    expect(result).toEqual({ deleted: 2, hasMore: false })
    expect(await oauthAccountExistsByProviderUserId('github', beforeLowerBoundProviderUserId)).toBe(
      true,
    )
    expect(await oauthAccountExistsByProviderUserId('github', firstEligibleProviderUserId)).toBe(
      false,
    )
    expect(await oauthAccountExistsByProviderUserId('github', secondEligibleProviderUserId)).toBe(
      false,
    )
    expect(await oauthAccountExistsByProviderUserId('github', atUpperBoundProviderUserId)).toBe(
      true,
    )
    expect(await oauthAccountExistsByProviderUserId('github', afterUpperBoundProviderUserId)).toBe(
      true,
    )
  }, 30_000)
})

describe('retention publication capture', () => {
  it('captures every authored post across bounded pages before purging its owner', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    const postIds = await insertTestPostBatch(user.id, 2)
    onTestFinished(async () => hardDeleteTestPosts(postIds))
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    const cutoffDate = getRetentionCutoffDate(window.retentionDays, window.now)
    // Target the owned user: the global one-row selector may choose a concurrent test's user.
    const nextPage = () =>
      cleanupSoftDeletedUser(user.id, cutoffDate, window.lowerBoundDate, 1, { remainingRows: 1 })

    await expect(nextPage()).resolves.toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
    const authorWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'author',
      id: user.id,
    })
    expect(authorWork).toMatchObject({ author_identity_id: user.id })
    const firstPageIds = await listTestPostPublicationImpactPostIds(authorWork!.id)
    expect(firstPageIds).toHaveLength(1)
    expect(postIds).toContain(firstPageIds[0])

    await expect(nextPage()).resolves.toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
    const allImpactIds = postIds.toSorted()
    await expect(listTestPostPublicationImpactPostIds(authorWork!.id)).resolves.toEqual(
      allImpactIds,
    )

    await expect(nextPage()).resolves.toEqual({ deleted: 1, hasMore: false })
    expect(await getTestUserRaw(user.id)).toBeNull()
    await expect(listTestPostPublicationImpactPostIds(authorWork!.id)).resolves.toEqual(
      allImpactIds,
    )
  })
})
