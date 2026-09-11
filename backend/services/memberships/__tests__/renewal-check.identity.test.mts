import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import {
  claimRenewalPriceIncreaseNotification,
  getUsersApproachingRenewalWithPriceIncrease,
} from '../renewal-check.mts'
import {
  markRenewalPriceIncreaseNotificationDelivered,
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
} from '../renewal-notification-delivery.mts'

function createPlusSku(
  priceMinorUnits: number,
  providerApplicationId: string,
  stripePriceId?: string,
) {
  return createTestSku({
    plan: 'plus',
    price_minor_units: priceMinorUnits,
    interval: 'monthly',
    provider_application_id: providerApplicationId,
    stripe_price_id: stripePriceId,
  })
}

function renewalEffectiveAt(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

async function createRenewal(
  userId: string,
  currentSku: Awaited<ReturnType<typeof createPlusSku>>,
  renewalSku: Awaited<ReturnType<typeof createPlusSku>>,
  providerApplicationId: string,
  effectiveAt: Date,
) {
  const membership = await createMembership({
    userId,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt: effectiveAt,
    stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
    providerEnvironment: 'production',
    providerApplicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: effectiveAt,
  })
  return { membership, ...observation }
}

async function deliverRenewal(
  membershipId: string,
  userId: string,
  observationId: string,
): Promise<void> {
  const claimToken = await claimRenewalPriceIncreaseNotification(
    membershipId,
    userId,
    observationId,
  )
  expect(claimToken).toEqual(expect.any(String))
  await expect(
    markRenewalPriceIncreaseNotificationDeliveryAttempted(
      membershipId,
      userId,
      observationId,
      claimToken!,
    ),
  ).resolves.toBe(true)
  await expect(
    markRenewalPriceIncreaseNotificationDelivered(membershipId, userId, observationId, claimToken!),
  ).resolves.toBe(true)
}

describe('renewal notification identity', () => {
  it('requalifies the same target price at a later effective time', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(800, applicationId)
    const user = await createTestUser()
    const first = await createRenewal(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(10),
    )
    await deliverRenewal(first.membership.id, user.id, first.membership_provider_observation_id)

    const later = await attachTestStripeProductionProviderObservation({
      membership_id: first.membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_effective_at: renewalEffectiveAt(20),
    })
    const result = (await getUsersApproachingRenewalWithPriceIncrease()).find(
      candidate => candidate.user_id === user.id,
    )
    expect(result?.membership_provider_observation_id).toBe(
      later.membership_provider_observation_id,
    )
  })

  it('treats a changed amount on the same provider product as a new increase', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const stripePriceId = `price_renewal_${randomUUID()}`
    const initialTarget = await createPlusSku(800, applicationId, stripePriceId)
    const user = await createTestUser()
    const first = await createRenewal(
      user.id,
      currentSku,
      initialTarget,
      applicationId,
      renewalEffectiveAt(10),
    )
    await deliverRenewal(first.membership.id, user.id, first.membership_provider_observation_id)

    const changedTarget = await createPlusSku(900, applicationId, stripePriceId)
    expect(changedTarget.membership_provider_product_id).toBe(
      initialTarget.membership_provider_product_id,
    )
    const changed = await attachTestStripeProductionProviderObservation({
      membership_id: first.membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: changedTarget.membership_provider_product_id,
      renewal_effective_at: renewalEffectiveAt(20),
    })
    const result = (await getUsersApproachingRenewalWithPriceIncrease()).find(
      candidate => candidate.user_id === user.id,
    )
    expect(result).toMatchObject({
      membership_provider_observation_id: changed.membership_provider_observation_id,
      new_price: { amount: 900, currency: 'usd' },
    })
  })

  it('accepts an authoritative renewal target retired from new purchases', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(800, applicationId)
    await retireTestMembershipProviderProduct(renewalSku.membership_provider_product_id)
    const user = await createTestUser()
    const renewal = await createRenewal(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(15),
    )

    const result = (await getUsersApproachingRenewalWithPriceIncrease()).find(
      candidate => candidate.user_id === user.id,
    )
    expect(result?.membership_provider_observation_id).toBe(
      renewal.membership_provider_observation_id,
    )
  })

  it('allows a different renewal after an ambiguous prior delivery attempt', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const firstTarget = await createPlusSku(800, applicationId)
    const secondTarget = await createPlusSku(900, applicationId)
    const user = await createTestUser()
    const first = await createRenewal(
      user.id,
      currentSku,
      firstTarget,
      applicationId,
      renewalEffectiveAt(10),
    )
    const firstToken = await claimRenewalPriceIncreaseNotification(
      first.membership.id,
      user.id,
      first.membership_provider_observation_id,
    )
    await markRenewalPriceIncreaseNotificationDeliveryAttempted(
      first.membership.id,
      user.id,
      first.membership_provider_observation_id,
      firstToken!,
    )

    const second = await attachTestStripeProductionProviderObservation({
      membership_id: first.membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: secondTarget.membership_provider_product_id,
      renewal_effective_at: renewalEffectiveAt(20),
    })
    await expect(
      claimRenewalPriceIncreaseNotification(
        first.membership.id,
        user.id,
        second.membership_provider_observation_id,
      ),
    ).resolves.toEqual(expect.any(String))
  })
})
