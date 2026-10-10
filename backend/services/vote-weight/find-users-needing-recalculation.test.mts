import { describe, it, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUserDirect,
  rejectTestMembershipProviderEvidence,
  setTestUserVoteWeightRecalculatedAt,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { findUsersNeedingVoteWeightRecalculation } from './find-users-needing-recalculation.mts'
import { adminSetVoteWeight } from './admin-set.mts'

const now = new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-31T23:59:59.900Z')
const referenceTime = now.getTime()
const futureExpiry = new Date(referenceTime + 86_400_000)

const randomUsername = () => `test-vw-find-${randomBytes(4).toString('hex')}`

async function createOwnedTestUser() {
  const users = await Promise.all([
    createTestUserDirect({ username: randomUsername() }),
    createTestUserDirect({ username: randomUsername() }),
  ])
  if (!users[0] || !users[1]) throw new Error('Expected owned vote-weight fixtures')
  const [earlier, later] = users.toSorted((a, b) => a!.id.localeCompare(b!.id))
  return { user: later!, afterId: earlier!.id }
}

// Note: the 7-day, 30-day, 1-year, 2-year, and 5-year threshold branches all require
// users whose account UUIDs encode a timestamp that far in the past. Since UUIDv7 IDs
// encode the current creation time, these thresholds cannot be integration-tested with
// createTestUserDirect without dedicated aged-user test infrastructure. The null
// vote_weight_recalculated_at path (below) covers the primary new-user case.
describe('findUsersNeedingVoteWeightRecalculation', () => {
  it('includes a new user with null vote_weight_recalculated_at', async () => {
    // Create two users and sort by id to ensure the cursor is strictly before the user
    // under test, even if both were created in the same millisecond (UUIDv7 ordering
    // within the same ms is by random bits, not insertion order).
    const u1 = await createTestUserDirect({ username: randomUsername() })
    const u2 = await createTestUserDirect({ username: randomUsername() })
    const [earlier, later] = [u1!, u2!].toSorted((a, b) => (a.id < b.id ? -1 : 1))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(earlier.id, 1, {
      now,
      userIds: [earlier.id, later.id],
    })
    expect(userIds).toContain(later.id)
  }, 30_000)

  it('excludes a user with vote_weight_admin_set_at set', async () => {
    const { user, afterId } = await createOwnedTestUser()
    await adminSetVoteWeight(user!.id, user!.id, 5)
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })
    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('excludes a recently recalculated user (no age threshold crossed)', async () => {
    const { user, afterId } = await createOwnedTestUser()
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })
    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('includes a user after a finite grant expires', async () => {
    const { user, afterId } = await createOwnedTestUser()
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      effective_at: new Date(referenceTime - 180_000),
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))
    await updateTestMembershipExpiresAt(membership.id, new Date(referenceTime - 60_000))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })
    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('does not include a user for an elapsed direct provider term', async () => {
    const { user, afterId } = await createOwnedTestUser()
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      effective_at: new Date(referenceTime - 180_000),
      stripe_subscription_id: `sub_vote_weight_${randomUUID()}`,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(referenceTime - 60_000))
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('includes a user when current family evidence is rejected after recalculation', async () => {
    const { user, afterId } = await createOwnedTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-rejected-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(referenceTime - 180_000),
      sourceUpdatedAt: new Date(referenceTime - 180_000),
      expiresAt: futureExpiry,
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: user!.id,
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 60_000))
    await rejectTestMembershipProviderEvidence(family.id, now)

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when family source authority is paused after recalculation', async () => {
    const { user, afterId } = await createOwnedTestUser()
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 60_000))
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-paused-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(referenceTime - 180_000),
      expiresAt: futureExpiry,
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceStatus: 'paused',
      sourceUpdatedAt: now,
      userId: user!.id,
    })

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when a newly observed family expiry was already elapsed', async () => {
    const { user, afterId } = await createOwnedTestUser()
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 60_000))
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-elapsed-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(referenceTime - 180_000),
      expiresAt: futureExpiry,
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date(referenceTime - 180_000),
      sourceExpiresAt: new Date(referenceTime - 120_000),
      sourceUpdatedAt: now,
      userId: user!.id,
    })

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when an observed family source becomes effective', async () => {
    const { user, afterId } = await createOwnedTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-effective-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(referenceTime - 180_000),
      sourceUpdatedAt: new Date(referenceTime - 180_000),
      expiresAt: futureExpiry,
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date(referenceTime - 60_000),
      userId: user!.id,
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 90_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when a family projection expires before its source', async () => {
    const { user, afterId } = await createOwnedTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-projection-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(referenceTime - 180_000),
      expiresAt: new Date(referenceTime - 60_000),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceUpdatedAt: new Date(referenceTime - 180_000),
      sourceEffectiveAt: new Date(referenceTime - 180_000),
      sourceExpiresAt: futureExpiry,
      userId: user!.id,
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 90_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(afterId, 1, {
      now,
      userIds: [user.id],
    })

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('returns nextCursor when results equal the limit', async () => {
    // Ensure at least one user needs recalculation
    const user = await createTestUserDirect({ username: randomUsername() })
    const { userIds, nextCursor } = await findUsersNeedingVoteWeightRecalculation(null, 1, {
      now,
      userIds: [user.id.toUpperCase(), user.id],
    })
    expect(userIds).toHaveLength(1)
    expect(nextCursor).toBe(userIds[0])
  }, 30_000)

  it('cursor paginates: afterId skips users with id <= afterId', async () => {
    const u1 = await createTestUserDirect({ username: randomUsername() })
    const u2 = await createTestUserDirect({ username: randomUsername() })
    // Sort by id so the cursor is the earlier (smaller) id regardless of insertion order
    // within the same millisecond (UUIDv7 has random sub-ms bits, not strictly sequential).
    const [earlier, later] = [u1!, u2!].toSorted((a, b) => (a.id < b.id ? -1 : 1))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(earlier.id, 1, {
      now,
      userIds: [earlier.id, later.id],
    })
    expect(userIds).not.toContain(earlier.id)
    expect(userIds).toContain(later.id)
  }, 30_000)
  it('returns an empty selected batch without scanning global users', async () => {
    await expect(
      findUsersNeedingVoteWeightRecalculation(null, 1, { now, userIds: [] }),
    ).resolves.toEqual({ userIds: [], nextCursor: null })
  })

  it('rejects malformed and oversized selected batches before reading', async () => {
    await expect(
      findUsersNeedingVoteWeightRecalculation(null, 1, { now, userIds: ['not-a-uuid'] }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      findUsersNeedingVoteWeightRecalculation(null, 1, {
        now,
        userIds: Array.from({ length: 101 }, () => randomUUID()),
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
