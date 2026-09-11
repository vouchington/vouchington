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

describe('cleanup retention windows', () => {
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
  }, 60_000)

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
  it('captures every authored post before purging a high-volume author', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    const postIds = await insertTestPostBatch(user.id, 1_001)
    onTestFinished(async () => hardDeleteTestPosts(postIds))

    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
    const authorWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'author',
      id: user.id,
    })
    expect(authorWork).toMatchObject({ author_user_id: user.id })
    await expect(listTestPostPublicationImpactPostIds(authorWork!.id)).resolves.toHaveLength(
      postIds.length,
    )
  }, 60_000)
})
