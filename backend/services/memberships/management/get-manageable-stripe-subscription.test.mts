import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  beginTransaction,
} from '@voucha/test-helpers'
import {
  createMembership,
  grantMembership,
  updateMembershipFromWebhook,
} from '@services/memberships'
import { getMembershipByUserId } from '@services/memberships/get'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { getManageableStripeSubscriptionByUserId } from './get-manageable-stripe-subscription.mts'

describe('manageable Stripe subscription lookup', () => {
  it('selects the latest ended projection for a retained direct source', async () => {
    const administrator = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const context = {
      environment: 'production' as const,
      applicationId: `manageable-stripe-subscription-${randomUUID()}`,
    }
    const plus = await createTestSku({
      plan: 'plus',
      provider_application_id: context.applicationId,
    })
    const pro = await createTestSku({
      plan: 'pro',
      provider_application_id: context.applicationId,
    })
    const retainedSubscriptionId = `sub_retained_history_${randomUUID()}`
    const firstRetainedProjection = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: plus.id,
      stripeSubscriptionId: retainedSubscriptionId,
      stripeCustomerId: `cus_retained_history_${randomUUID()}`,
      providerEnvironment: 'production',
      providerApplicationId: context.applicationId,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: firstRetainedProjection.id,
      membership_provider_product_id: plus.membership_provider_product_id,
    })

    await endTestMembershipProjection(firstRetainedProjection.id)
    const firstCoveringFamily = await createTestFamilyMembership({
      applicationId: context.applicationId,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: pro.id,
      membershipProviderProductId: pro.membership_provider_product_id,
      sourceStatus: 'paused',
      userId: member.id,
    })
    await restoreFallbackAfterCurrentAccessEnds(member.id, firstCoveringFamily.id)
    const secondRetainedProjection = await getMembershipByUserId(member.id)
    expect(secondRetainedProjection).toMatchObject({
      stripe_subscription_id: retainedSubscriptionId,
    })

    await endTestMembershipProjection(secondRetainedProjection!.id)
    const secondCoveringFamily = await createTestFamilyMembership({
      applicationId: context.applicationId,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: pro.id,
      membershipProviderProductId: pro.membership_provider_product_id,
      sourceStatus: 'paused',
      userId: member.id,
    })
    await restoreFallbackAfterCurrentAccessEnds(member.id, secondCoveringFamily.id)
    const latestRetainedProjection = await getMembershipByUserId(member.id)
    expect(latestRetainedProjection).toMatchObject({
      stripe_subscription_id: retainedSubscriptionId,
    })
    expect(latestRetainedProjection!.id).not.toBe(firstRetainedProjection.id)
    expect(latestRetainedProjection!.id).not.toBe(secondRetainedProjection!.id)

    await grantMembership(administrator.id, member.id, 'pro', pro.id, 30)
    await updateMembershipFromWebhook(
      { membershipId: latestRetainedProjection!.id, status: 'paused' },
      async () => false,
    )

    await expect(
      getManageableStripeSubscriptionByUserId(member.id, context),
    ).resolves.toMatchObject({
      membershipId: latestRetainedProjection!.id,
      subscriptionId: retainedSubscriptionId,
      retainedWhileGrantActive: true,
    })
  })
})

async function restoreFallbackAfterCurrentAccessEnds(
  userId: string,
  membershipId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await restoreFallbackAfterCurrentAccessEndsInTransaction(userId, membershipId, transaction)
  await transaction.commit()
}
