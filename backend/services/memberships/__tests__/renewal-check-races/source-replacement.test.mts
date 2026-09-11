import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createMembership } from '../../create.mts'
import { claimRenewalPriceIncreaseNotification } from '../../renewal-check.mts'
import {
  markRenewalPriceIncreaseNotificationDelivered,
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  releaseRenewalPriceIncreaseNotification,
} from '../../renewal-notification-delivery.mts'
import { getCurrentRenewalPriceIncreaseDetails } from '../../renewal-price-increase-details.mts'

async function createRenewal() {
  const applicationId = `renewal-source-replacement-${randomUUID()}`
  const currentSku = await createTestSku({
    plan: 'plus',
    interval: 'monthly',
    price_minor_units: 500,
    provider_application_id: applicationId,
  })
  const renewalSku = await createTestSku({
    plan: 'plus',
    interval: 'monthly',
    price_minor_units: 800,
    provider_application_id: applicationId,
  })
  const user = await createTestUser()
  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  const stripeSubscriptionId = `sub_renewal_source_replacement_${randomUUID()}`
  const membership = await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt,
    stripeSubscriptionId,
    providerEnvironment: 'production',
    providerApplicationId: applicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: expiresAt,
  })
  return {
    applicationId,
    currentSku,
    expiresAt,
    membership,
    observation,
    stripeSubscriptionId,
    user,
  }
}

async function replaceMembershipSource(renewal: Awaited<ReturnType<typeof createRenewal>>) {
  await createMembership({
    userId: renewal.user.id,
    plan: 'plus',
    skuId: renewal.currentSku.id,
    expiresAt: renewal.expiresAt,
    status: 'cancelled',
    stripeSubscriptionId: renewal.stripeSubscriptionId,
    providerEnvironment: 'production',
    providerApplicationId: renewal.applicationId,
  })
  await createMembership({
    userId: renewal.user.id,
    plan: 'plus',
    skuId: renewal.currentSku.id,
    expiresAt: renewal.expiresAt,
    stripeSubscriptionId: `sub_replacement_${randomUUID()}`,
    providerEnvironment: 'production',
    providerApplicationId: renewal.applicationId,
  })
}

describe('renewal notification source replacement', () => {
  it('records SES acceptance after the membership source is replaced', async () => {
    const renewal = await createRenewal()
    const claimToken = await claimRenewalPriceIncreaseNotification(
      renewal.membership.id,
      renewal.user.id,
      renewal.observation.membership_provider_observation_id,
    )
    expect(claimToken).toEqual(expect.any(String))
    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        renewal.membership.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toBe(true)
    await replaceMembershipSource(renewal)

    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        renewal.membership.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toMatchObject({
      current_price: { amount: 500, currency: 'usd' },
      new_price: { amount: 800, currency: 'usd' },
      expires_at: renewal.expiresAt,
      interval: 'monthly',
      plan: 'plus',
    })
    await expect(
      markRenewalPriceIncreaseNotificationDelivered(
        renewal.membership.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toBe(true)
  })

  it('rejects and releases a claim whose source is replaced before delivery', async () => {
    const renewal = await createRenewal()
    const claimToken = await claimRenewalPriceIncreaseNotification(
      renewal.membership.id,
      renewal.user.id,
      renewal.observation.membership_provider_observation_id,
    )
    expect(claimToken).toEqual(expect.any(String))
    await replaceMembershipSource(renewal)

    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        renewal.membership.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toBe(false)
    await releaseRenewalPriceIncreaseNotification(
      renewal.membership.id,
      renewal.user.id,
      renewal.observation.membership_provider_observation_id,
      claimToken!,
    )
    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        renewal.membership.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toBeNull()
  })
})
