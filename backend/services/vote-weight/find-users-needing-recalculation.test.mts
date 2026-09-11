import { describe, it, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUserDirect,
  rejectTestMembershipProviderEvidence,
  setTestMembershipSourceStateUpdatedAt,
  setTestUserVoteWeightRecalculatedAt,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { findUsersNeedingVoteWeightRecalculation } from './find-users-needing-recalculation.mts'
import { adminSetVoteWeight } from './admin-set.mts'

const randomUsername = () => `test-vw-find-${randomBytes(4).toString('hex')}`

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
    const [earlier, later] = [u1!, u2!].sort((a, b) => (a.id < b.id ? -1 : 1))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(earlier.id, 10_000)
    expect(userIds).toContain(later.id)
  }, 60_000)

  it('excludes a user with vote_weight_admin_set_at set', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    await adminSetVoteWeight(user!.id, 5)
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)
    expect(userIds).not.toContain(user!.id)
  }, 60_000)

  it('excludes a recently recalculated user (no age threshold crossed)', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 120_000))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)
    expect(userIds).not.toContain(user!.id)
  }, 60_000)

  it('includes a user after a finite grant expires', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const membership = await createTestMembership({ user_id: user!.id, plan: 'plus' })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 120_000))
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)
    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('does not include a user for an elapsed direct provider term', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      stripe_subscription_id: `sub_vote_weight_${randomUUID()}`,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 120_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).not.toContain(user!.id)
  }, 60_000)

  it('includes a user when current family evidence is rejected after recalculation', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-rejected-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: user!.id,
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 60_000))
    await rejectTestMembershipProviderEvidence(family.id)

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('includes a user when family source authority is paused after recalculation', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 60_000))
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-paused-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceStatus: 'paused',
      userId: user!.id,
    })

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('includes a user when a newly observed family expiry was already elapsed', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 60_000))
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-elapsed-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date(Date.now() - 180_000),
      sourceExpiresAt: new Date(Date.now() - 120_000),
      userId: user!.id,
    })

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('includes a user when an observed family source becomes effective', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-effective-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date(Date.now() - 60_000),
      userId: user!.id,
    })
    await setTestMembershipSourceStateUpdatedAt(family.id, new Date(Date.now() - 180_000))
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 90_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('includes a user when a family projection expires before its source', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-projection-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date(Date.now() - 180_000),
      expiresAt: new Date(Date.now() - 60_000),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date(Date.now() - 180_000),
      sourceExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      userId: user!.id,
    })
    await setTestMembershipSourceStateUpdatedAt(family.id, new Date(Date.now() - 180_000))
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(Date.now() - 90_000))

    const { userIds } = await findUsersNeedingVoteWeightRecalculation(null, 10_000)

    expect(userIds).toContain(user!.id)
  }, 60_000)

  it('returns nextCursor when results equal the limit', async () => {
    // Ensure at least one user needs recalculation
    await createTestUserDirect({ username: randomUsername() })
    const { userIds, nextCursor } = await findUsersNeedingVoteWeightRecalculation(null, 1)
    expect(userIds).toHaveLength(1)
    expect(nextCursor).toBe(userIds[0])
  }, 60_000)

  it('cursor paginates: afterId skips users with id <= afterId', async () => {
    const u1 = await createTestUserDirect({ username: randomUsername() })
    const u2 = await createTestUserDirect({ username: randomUsername() })
    // Sort by id so the cursor is the earlier (smaller) id regardless of insertion order
    // within the same millisecond (UUIDv7 has random sub-ms bits, not strictly sequential).
    const [earlier, later] = [u1!, u2!].sort((a, b) => (a.id < b.id ? -1 : 1))
    const { userIds } = await findUsersNeedingVoteWeightRecalculation(earlier.id, 10_000)
    expect(userIds).not.toContain(earlier.id)
    expect(userIds).toContain(later.id)
  }, 60_000)
})
