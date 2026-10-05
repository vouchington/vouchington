import { randomUUID } from 'node:crypto'
import {
  attachTestStripeProductionProviderObservation,
  createTestMembership,
  createTestSku,
  updateTestMembershipExpiresAt,
} from './entities/index.mts'
import { prepareRenewalPriceIncreaseNotification } from '../services/memberships/renewal-check.mts'

export async function createTestRenewalEmail(userId: string) {
  const providerApplicationId = `renewal-email-${randomUUID()}`
  const currentSku = await createTestSku({
    plan: 'pro',
    price_minor_units: 900,
    interval: 'yearly',
    provider_application_id: providerApplicationId,
  })
  const membership = await createTestMembership({
    user_id: userId,
    plan: 'pro',
    sku_id: currentSku.id,
    stripe_subscription_id: `sub_renewal_email_${randomUUID()}`,
    provider_environment: 'production',
    provider_application_id: providerApplicationId,
  })
  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  await updateTestMembershipExpiresAt(membership.id, expiresAt)
  const newSku = await createTestSku({
    plan: 'pro',
    price_minor_units: 1200,
    interval: 'yearly',
    provider_application_id: providerApplicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: newSku.membership_provider_product_id,
    renewal_effective_at: expiresAt,
  })

  const generation = await prepareRenewalPriceIncreaseNotification(
    membership.id,
    userId,
    observation.membership_provider_observation_id,
  )
  const data = {
    generation: generation!,
    userId,
    membershipId: membership.id,
    membershipProviderObservationId: observation.membership_provider_observation_id,
    currentPriceCents: 900,
    newPriceCents: 1200,
    currency: 'USD',
    plan: 'pro',
    interval: 'year',
    expiresAt: expiresAt.toISOString(),
  }
  return { data, renewalProductId: newSku.membership_provider_product_id }
}
