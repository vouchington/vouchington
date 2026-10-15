import {
  createPlusSku,
  createObservedRenewingMembership,
  readOwnedRenewalCandidates,
} from '@voucha/test-helpers/renewal-notification-fixtures'
import { RenewalBusinessTime } from './renewal-business-time.mts'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  ageTestMembershipRenewalPriceIncreaseClaim,
  attachTestStripeProductionProviderObservation,
  createTestUser,
  createTestSku,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { getUsersApproachingRenewalWithPriceIncrease } from './renewal-check.mts'
import { claimTestRenewalPriceIncreaseNotification as claimRenewalPriceIncreaseNotification } from '@voucha/test-helpers/renewal-notification-claims'
import {
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  markRenewalPriceIncreaseNotificationDelivered,
} from './renewal-notification-delivery.mts'
import { createMembership } from './create.mts'

const businessTime = new RenewalBusinessTime(new Date('2030-01-31T23:59:59.999Z'))

function renewalEffectiveAt(daysFromNow = 15): Date {
  return new Date(Date.parse(businessTime.iso) + daysFromNow * 24 * 60 * 60 * 1000)
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

      const results = await readOwnedRenewalCandidates(firstRenewal.membership.id, businessTime)
      const found = results.find(r => r.user_id === renewalUser.id)
      expect(found).toBeDefined()
      expect(found!.current_price).toEqual({ amount: 500, currency: 'usd' })
      expect(found!.new_price.amount).toBeGreaterThanOrEqual(800)
      expect(found!.new_price.currency).toBe('usd')

      const firstClaimToken = await claimRenewalPriceIncreaseNotification(
        firstRenewal.membership.id,
        renewalUser.id,
        found!.membership_provider_observation_id,
        businessTime,
      )
      expect(firstClaimToken).toMatchObject({
        leaseToken: expect.any(String),
        generation: expect.any(String),
      })
      await expect(
        claimRenewalPriceIncreaseNotification(
          firstRenewal.membership.id,
          renewalUser.id,
          found!.membership_provider_observation_id,
          businessTime,
        ),
      ).resolves.toBeNull()
      const secondRenewal = await attachTestStripeProductionProviderObservation({
        membership_id: firstRenewal.membership.id,
        membership_provider_product_id: oldSku.membership_provider_product_id,
        renewal_membership_provider_product_id: newSku.membership_provider_product_id,
        renewal_effective_at: effectiveAt,
      })
      const claimedResults = await readOwnedRenewalCandidates(
        firstRenewal.membership.id,
        businessTime,
      )
      expect(claimedResults.some(r => r.user_id === renewalUser.id)).toBe(false)
      await ageTestMembershipRenewalPriceIncreaseClaim(firstRenewal.membership.id)
      const staleClaimResults = await readOwnedRenewalCandidates(
        firstRenewal.membership.id,
        businessTime,
      )
      expect(
        staleClaimResults.find(r => r.user_id === renewalUser.id)
          ?.membership_provider_observation_id,
      ).toBe(secondRenewal.membership_provider_observation_id)
      const secondClaimToken = await claimRenewalPriceIncreaseNotification(
        firstRenewal.membership.id,
        renewalUser.id,
        secondRenewal.membership_provider_observation_id,
        businessTime,
      )
      expect(secondClaimToken).toMatchObject({
        leaseToken: expect.any(String),
        generation: expect.any(String),
      })
      await expect(
        markRenewalPriceIncreaseNotificationDeliveryAttempted(
          firstRenewal.membership.id,
          renewalUser.id,
          secondRenewal.membership_provider_observation_id,
          secondClaimToken!,
          businessTime,
        ),
      ).resolves.toBe(true)
      await ageTestMembershipRenewalPriceIncreaseClaim(firstRenewal.membership.id)
      const attemptedResults = await readOwnedRenewalCandidates(
        firstRenewal.membership.id,
        businessTime,
      )
      expect(attemptedResults.some(r => r.user_id === renewalUser.id)).toBe(false)
      await expect(
        markRenewalPriceIncreaseNotificationDelivered(
          firstRenewal.membership.id,
          renewalUser.id,
          secondRenewal.membership_provider_observation_id,
          secondClaimToken!,
        ),
      ).resolves.toBe(false)
      const deliveredResults = await readOwnedRenewalCandidates(
        firstRenewal.membership.id,
        businessTime,
      )
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
      const renewal = await createObservedRenewingMembership(
        user.id,
        usdSku,
        eurSku,
        providerApplicationId,
        renewalEffectiveAt(),
      )

      const results = await readOwnedRenewalCandidates(renewal.membership.id, businessTime)
      expect(results.some(result => result.user_id === user.id)).toBe(false)
    })
  })
})
