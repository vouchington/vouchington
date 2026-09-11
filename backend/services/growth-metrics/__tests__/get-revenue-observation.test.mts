import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { getRevenue } from '../get-revenue.mts'

describe('growth revenue provider observations', () => {
  it('attributes MRR to the subscription observation instead of a newer catalog price', async () => {
    const user = await createTestUser()
    const observedPriceMinorUnits = 731
    const applicationId = `revenue-observation-${crypto.randomUUID()}`
    const context = { applicationId }
    const observedSku = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      price_minor_units: observedPriceMinorUnits,
      provider_application_id: applicationId,
    })
    const scope = { userIds: [user.id] }
    const before = await getRevenue('all', new Date(0), scope, context)
    const membership = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      sku_id: observedSku.id,
      stripe_subscription_id: `sub_observed_revenue_${crypto.randomUUID()}`,
      provider_environment: 'production',
      provider_application_id: applicationId,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: membership.id,
      membership_provider_product_id: observedSku.membership_provider_product_id,
    })
    await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      price_minor_units: observedPriceMinorUnits + 10_000,
      provider_application_id: applicationId,
    })

    const result = await getRevenue('all', new Date(0), scope, context)
    const usdBefore = before.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
    const usdAfter = result.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
    expect(BigInt(usdAfter) - BigInt(usdBefore)).toBe(BigInt(observedPriceMinorUnits) * 10_000n)
  })

  it('counts family access without duplicating the purchaser MRR', async () => {
    const user = await createTestUser()
    const applicationId = `revenue-family-${crypto.randomUUID()}`
    const context = { applicationId }
    const sku = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      provider_application_id: applicationId,
    })
    const scope = { userIds: [user.id] }
    const before = await getRevenue('all', new Date(0), scope, context)
    await createTestFamilyMembership({
      applicationId,
      expiresAt: new Date(Date.now() + 86_400_000),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: user.id,
    })

    const result = await getRevenue('all', new Date(0), scope, context)
    expect(result.active_memberships).toBe(before.active_memberships + 1)
    expect(result.memberships_by_tier.plus).toBe((before.memberships_by_tier.plus ?? 0) + 1)
    expect(result.mrr_by_currency).toEqual(before.mrr_by_currency)
  })
})
