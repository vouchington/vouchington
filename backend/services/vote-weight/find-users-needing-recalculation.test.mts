import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  rejectTestMembershipProviderEvidence,
  setTestUserVoteWeightRecalculatedAt,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { findUsersNeedingVoteWeightRecalculation } from './find-users-needing-recalculation.mts'
import { adminSetVoteWeight } from './admin-set.mts'
import {
  collectVoteWeightFixtureResults,
  createVoteWeightRecalculationFixture,
} from '@voucha/test-helpers/vote-weight-recalculation-fixtures'

// These fixtures exercise new-user and membership decisions. Their reference clock
// stays four minutes after UUIDv7 creation; separate aged fixtures are needed to
// exercise the 7-day, 30-day, 1-year, 2-year, and 5-year account thresholds.
describe('findUsersNeedingVoteWeightRecalculation', () => {
  it('includes a new user with null vote_weight_recalculated_at', async () => {
    const { user, afterId, now } = await createVoteWeightRecalculationFixture()
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )
    expect(userIds).toContain(user.id)
  }, 30_000)

  it('excludes a user with vote_weight_admin_set_at set', async () => {
    const { user, afterId, now } = await createVoteWeightRecalculationFixture()
    await adminSetVoteWeight(user!.id, user!.id, 5)
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )
    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('excludes a recently recalculated user (no age threshold crossed)', async () => {
    const { user, afterId, now, referenceTime } = await createVoteWeightRecalculationFixture()
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )
    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('includes a user after a finite grant expires', async () => {
    const { user, afterId, now, referenceTime } = await createVoteWeightRecalculationFixture()
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      effective_at: new Date(referenceTime - 180_000),
    })
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))
    await updateTestMembershipExpiresAt(membership.id, new Date(referenceTime - 60_000))
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )
    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('does not include a user for an elapsed direct provider term', async () => {
    const { user, afterId, now, referenceTime } = await createVoteWeightRecalculationFixture()
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      effective_at: new Date(referenceTime - 180_000),
      stripe_subscription_id: `sub_vote_weight_${randomUUID()}`,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(referenceTime - 60_000))
    await setTestUserVoteWeightRecalculatedAt(user!.id, new Date(referenceTime - 120_000))

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).not.toContain(user!.id)
  }, 30_000)

  it('includes a user when current family evidence is rejected after recalculation', async () => {
    const { user, afterId, now, referenceTime, futureExpiry } =
      await createVoteWeightRecalculationFixture()
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

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when family source authority is paused after recalculation', async () => {
    const { user, afterId, now, referenceTime, futureExpiry } =
      await createVoteWeightRecalculationFixture()
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

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when a newly observed family expiry was already elapsed', async () => {
    const { user, afterId, now, referenceTime, futureExpiry } =
      await createVoteWeightRecalculationFixture()
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

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when an observed family source becomes effective', async () => {
    const { user, afterId, now, referenceTime, futureExpiry } =
      await createVoteWeightRecalculationFixture()
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

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('includes a user when a family projection expires before its source', async () => {
    const { user, afterId, now, referenceTime, futureExpiry } =
      await createVoteWeightRecalculationFixture()
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

    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )

    expect(userIds).toContain(user!.id)
  }, 30_000)

  it('returns nextCursor when results equal the limit', async () => {
    await createVoteWeightRecalculationFixture()
    const { userIds, nextCursor } = await findUsersNeedingVoteWeightRecalculation(null, 1)
    expect(userIds).toHaveLength(1)
    expect(nextCursor).toBe(userIds[0])
  }, 30_000)

  it('cursor paginates: afterId skips users with id <= afterId', async () => {
    const { user, afterId, now } = await createVoteWeightRecalculationFixture()
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
      now,
    )
    expect(userIds).not.toContain(afterId)
    expect(userIds).toContain(user.id)
  }, 30_000)
  it('uses the database clock when the reference time is omitted', async () => {
    const { user, afterId } = await createVoteWeightRecalculationFixture()
    const { userIds } = await collectVoteWeightFixtureResults(
      findUsersNeedingVoteWeightRecalculation,
      afterId,
      user.id,
    )
    expect(userIds).toContain(user.id)
  })

  it('rejects an invalid reference time before reading', async () => {
    await expect(
      findUsersNeedingVoteWeightRecalculation(null, 1, { now: new Date('invalid') }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      findUsersNeedingVoteWeightRecalculation(null, 1, { now: new Date(Infinity) }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
