import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  ageTestMembershipRenewalPriceIncreaseClaim,
  attachTestStripeProductionProviderObservation,
  createTestUser,
  createTestSku,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import {
  claimRenewalPriceIncreaseNotification,
  getUsersApproachingRenewalWithPriceIncrease,
} from './renewal-check.mts'
import {
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  markRenewalPriceIncreaseNotificationDelivered,
} from './renewal-notification-delivery.mts'
import { createMembership } from './create.mts'

function createPlusSku(
  priceMinorUnits: number,
  options: {
    currency_code?: string
    provider_application_id: string
    stripe_price_id?: string
  },
) {
  return createTestSku({
    plan: 'plus',
    price_minor_units: priceMinorUnits,
    interval: 'monthly',
    ...options,
  })
}

async function createObservedRenewingMembership(
  userId: string,
  currentSku: { id: string; membership_provider_product_id: string },
  renewalSku: { membership_provider_product_id: string },
  providerApplicationId: string,
  renewalEffectiveAt: Date,
) {
  const membership = await createMembership({
    userId,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt: renewalEffectiveAt,
    stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
    providerEnvironment: 'production',
    providerApplicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: renewalEffectiveAt,
  })
  return { membership, ...observation }
}

function renewalEffectiveAt(daysFromNow = 15): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

describe('renewal-check', () => {
  it('retains an observation across a compatible direct-source projection replay', async () => {
    const providerApplicationId = `replay-compatible-${randomUUID()}`
    const currentSku = await createPlusSku(500, { provider_application_id: providerApplicationId })
    const renewalSku = await createPlusSku(800, { provider_application_id: providerApplicationId })
    const user = await createTestUser()
    const subscriptionId = `sub_replay_${randomUUID()}`
    const expiresAt = renewalEffectiveAt()
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
      providerApplicationId,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_effective_at: expiresAt,
    })

    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
      providerApplicationId,
    })

    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      membership_provider_observation_id: observation.membership_provider_observation_id,
    })
  })

  it('clears an observation when a direct-source replay changes product context', async () => {
    const providerApplicationId = `replay-product-change-${randomUUID()}`
    const plusSku = await createPlusSku(500, { provider_application_id: providerApplicationId })
    const proSku = await createTestSku({
      plan: 'pro',
      provider_application_id: providerApplicationId,
    })
    const user = await createTestUser()
    const subscriptionId = `sub_replay_${randomUUID()}`
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: plusSku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
      providerApplicationId,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: membership.id,
      membership_provider_product_id: plusSku.membership_provider_product_id,
    })

    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: proSku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
      providerApplicationId,
    })

    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      membership_provider_observation_id: null,
    })
  })

  it('returns an array', async () => {
    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(Array.isArray(results)).toBe(true)
  })

  describe('finds users approaching renewal with a price increase', () => {
    it('includes user with price increase expiring within 30 days', async () => {
      const providerApplicationId = `renewal-${randomUUID()}`
      const oldSku = await createPlusSku(500, { provider_application_id: providerApplicationId })
      const newSku = await createPlusSku(800, {
        provider_application_id: providerApplicationId,
      })

      const renewalUser = await createTestUser()
      const effectiveAt = renewalEffectiveAt()
      const firstRenewal = await createObservedRenewingMembership(
        renewalUser.id,
        oldSku,
        newSku,
        providerApplicationId,
        effectiveAt,
      )

      const results = await getUsersApproachingRenewalWithPriceIncrease()
      const found = results.find(r => r.user_id === renewalUser.id)
      expect(found).toBeDefined()
      expect(found!.current_price).toEqual({ amount: 500, currency: 'usd' })
      expect(found!.new_price.amount).toBeGreaterThanOrEqual(800)
      expect(found!.new_price.currency).toBe('usd')

      const firstClaimToken = await claimRenewalPriceIncreaseNotification(
        firstRenewal.membership.id,
        renewalUser.id,
        found!.membership_provider_observation_id,
      )
      expect(firstClaimToken).toEqual(expect.any(String))
      await expect(
        claimRenewalPriceIncreaseNotification(
          firstRenewal.membership.id,
          renewalUser.id,
          found!.membership_provider_observation_id,
        ),
      ).resolves.toBeNull()
      const secondRenewal = await attachTestStripeProductionProviderObservation({
        membership_id: firstRenewal.membership.id,
        membership_provider_product_id: oldSku.membership_provider_product_id,
        renewal_membership_provider_product_id: newSku.membership_provider_product_id,
        renewal_effective_at: effectiveAt,
      })
      const claimedResults = await getUsersApproachingRenewalWithPriceIncrease()
      expect(claimedResults.some(r => r.user_id === renewalUser.id)).toBe(false)
      await ageTestMembershipRenewalPriceIncreaseClaim(firstRenewal.membership.id)
      const staleClaimResults = await getUsersApproachingRenewalWithPriceIncrease()
      expect(
        staleClaimResults.find(r => r.user_id === renewalUser.id)
          ?.membership_provider_observation_id,
      ).toBe(secondRenewal.membership_provider_observation_id)
      const secondClaimToken = await claimRenewalPriceIncreaseNotification(
        firstRenewal.membership.id,
        renewalUser.id,
        secondRenewal.membership_provider_observation_id,
      )
      expect(secondClaimToken).toEqual(expect.any(String))
      await expect(
        markRenewalPriceIncreaseNotificationDeliveryAttempted(
          firstRenewal.membership.id,
          renewalUser.id,
          secondRenewal.membership_provider_observation_id,
          secondClaimToken!,
        ),
      ).resolves.toBe(true)
      await ageTestMembershipRenewalPriceIncreaseClaim(firstRenewal.membership.id)
      const attemptedResults = await getUsersApproachingRenewalWithPriceIncrease()
      expect(attemptedResults.some(r => r.user_id === renewalUser.id)).toBe(false)
      await expect(
        markRenewalPriceIncreaseNotificationDelivered(
          firstRenewal.membership.id,
          renewalUser.id,
          secondRenewal.membership_provider_observation_id,
          secondClaimToken!,
        ),
      ).resolves.toBe(true)
      await expect(
        markRenewalPriceIncreaseNotificationDelivered(
          firstRenewal.membership.id,
          renewalUser.id,
          secondRenewal.membership_provider_observation_id,
          secondClaimToken!,
        ),
      ).resolves.toBe(false)
      const deliveredResults = await getUsersApproachingRenewalWithPriceIncrease()
      expect(deliveredResults.some(r => r.user_id === renewalUser.id)).toBe(false)
    })

    it('compares renewal prices only within the current currency', async () => {
      const providerApplicationId = `renewal-${randomUUID()}`
      const usdSku = await createPlusSku(100_000, {
        provider_application_id: providerApplicationId,
      })
      const eurSku = await createPlusSku(200_000, {
        currency_code: 'eur',
        provider_application_id: providerApplicationId,
      })
      const user = await createTestUser()
      await createObservedRenewingMembership(
        user.id,
        usdSku,
        eurSku,
        providerApplicationId,
        renewalEffectiveAt(),
      )

      const results = await getUsersApproachingRenewalWithPriceIncrease()
      expect(results.some(result => result.user_id === user.id)).toBe(false)
    })
  })
})
