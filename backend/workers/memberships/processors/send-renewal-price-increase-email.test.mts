import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as ses from '@modules/aws/ses'
import {
  attachTestStripeProductionProviderObservation,
  createTestMembership,
  createTestSku,
  createTestUser,
  createTestUserDirect,
  retireTestMembershipProviderProduct,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'

describe('processSendRenewalPriceIncreaseEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('sends the renewal price increase email without unsubscribe headers', async () => {
    const user = await createTestUser()
    const providerApplicationId = `renewal-email-${randomUUID()}`
    const currentSku = await createTestSku({
      plan: 'pro',
      price_minor_units: 900,
      interval: 'yearly',
      provider_application_id: providerApplicationId,
    })
    const membership = await createTestMembership({
      user_id: user!.id,
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

    const data = {
      userId: user!.id,
      membershipId: membership.id,
      membershipProviderObservationId: observation.membership_provider_observation_id,
      currentPriceCents: 1,
      newPriceCents: 1200,
      currency: 'EUR',
      plan: 'plus',
      interval: 'month',
      expiresAt: '2000-01-01T00:00:00.000Z',
    }

    await processSendRenewalPriceIncreaseEmail(data)
    await processSendRenewalPriceIncreaseEmail(data)

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: 'Your Voucha Pro renewal price is changing',
        text: expect.stringMatching(/\$9\.00[\s\S]*\$12\.00/),
      }),
    )
    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.not.objectContaining({
        headers: expect.anything(),
      }),
    )
    await retireTestMembershipProviderProduct(newSku.membership_provider_product_id)
  })

  it('does not retry after delivery is attempted', async () => {
    const user = await createTestUser()
    const providerApplicationId = `renewal-email-${randomUUID()}`
    const currentSku = await createTestSku({
      plan: 'pro',
      price_minor_units: 900,
      interval: 'yearly',
      provider_application_id: providerApplicationId,
    })
    const membership = await createTestMembership({
      user_id: user!.id,
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
    const data = {
      userId: user!.id,
      membershipId: membership.id,
      membershipProviderObservationId: observation.membership_provider_observation_id,
      currentPriceCents: 900,
      newPriceCents: 1200,
      currency: 'USD',
      plan: 'pro',
      interval: 'year',
      expiresAt: expiresAt.toISOString(),
    }
    vi.mocked(ses.sendEmail).mockRejectedValueOnce(new Error('SES unavailable'))

    await expect(processSendRenewalPriceIncreaseEmail(data)).rejects.toThrow('SES unavailable')
    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()

    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    await retireTestMembershipProviderProduct(newSku.membership_provider_product_id)
  })

  it('releases the durable claim when the user has no email address', async () => {
    const user = await createTestUserDirect()
    const providerApplicationId = `renewal-email-${randomUUID()}`
    const currentSku = await createTestSku({
      plan: 'pro',
      price_minor_units: 900,
      interval: 'yearly',
      provider_application_id: providerApplicationId,
    })
    const membership = await createTestMembership({
      user_id: user!.id,
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
    const data = {
      userId: user!.id,
      membershipId: membership.id,
      membershipProviderObservationId: observation.membership_provider_observation_id,
      currentPriceCents: 900,
      newPriceCents: 1200,
      currency: 'USD',
      plan: 'pro',
      interval: 'year',
      expiresAt: expiresAt.toISOString(),
    }

    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()
    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
    await retireTestMembershipProviderProduct(newSku.membership_provider_product_id)
  })
})
