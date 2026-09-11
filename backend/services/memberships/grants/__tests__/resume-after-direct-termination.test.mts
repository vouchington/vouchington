import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  beginTransaction,
} from '@voucha/test-helpers'
import { createMembership } from '../../create.mts'
import { getMembershipByUserId } from '../../get.mts'
import { updateMembershipFromWebhook } from '../../update.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction } from '../resume-after-direct-termination.mts'

describe('direct source termination fallback', () => {
  it('restores a retained verified direct Stripe source after the covering direct source ends', async () => {
    const member = await createTestUser()
    const fallbackSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `direct-termination-fallback-${randomUUID()}`,
    })
    const fallbackSubscriptionId = `sub_direct_termination_fallback_${randomUUID()}`
    const fallback = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: fallbackSku.id,
      stripeSubscriptionId: fallbackSubscriptionId,
      providerApplicationId: fallbackSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: fallback.id,
      membership_provider_product_id: fallbackSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(fallback.id)
    const currentSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const current = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_direct_termination_current_${randomUUID()}`,
    })

    await updateMembershipFromWebhook(
      { membershipId: current.id, status: 'cancelled' },
      async () => false,
    )

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
      stripe_subscription_id: fallbackSubscriptionId,
    })
  })

  it.each(['past_due', 'active'] as const)(
    'reports provider-authoritative direct fallback access for a %s source',
    async status => {
      const member = await createTestUser()
      const fallbackSku = await createTestSku({
        plan: 'plus',
        provider_application_id: `direct-termination-${status}-${randomUUID()}`,
      })
      const fallback = await createMembership({
        expiresAt: new Date('2020-02-01T00:00:00.000Z'),
        effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
        plan: 'plus',
        providerApplicationId: fallbackSku.provider_application_id,
        skuId: fallbackSku.id,
        status,
        stripeSubscriptionId: `sub_direct_termination_${status}_${randomUUID()}`,
        userId: member.id,
      })
      await attachTestStripeProductionProviderObservation({
        membership_id: fallback.id,
        membership_provider_product_id: fallbackSku.membership_provider_product_id,
      })
      await endTestMembershipProjection(fallback.id)
      const currentSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
      const current = await createMembership({
        plan: 'pro',
        providerApplicationId: currentSku.provider_application_id,
        skuId: currentSku.id,
        stripeSubscriptionId: `sub_direct_termination_current_${randomUUID()}`,
        userId: member.id,
      })

      await updateMembershipFromWebhook(
        { membershipId: current.id, status: 'cancelled' },
        async () => false,
      )

      const outcome = await resumeGrantAfterDirectAccessSuspension(member.id, current.id)
      expect(outcome).toMatchObject({
        activeFamily: false,
        activeGrant: false,
        changed: false,
        retainsPaidAccess: true,
      })
      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        plan: 'plus',
        status,
      })
    },
  )
})

async function resumeGrantAfterDirectAccessSuspension(userId: string, membershipId: string) {
  await using transaction = await beginTransaction()
  const outcome = await resumeGrantAfterDirectAccessSuspensionInTransaction(
    userId,
    membershipId,
    transaction,
  )
  await transaction.commit()
  return outcome
}
