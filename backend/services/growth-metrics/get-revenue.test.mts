import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestFamilyMembership } from '@voucha/test-helpers/entities/memberships/family'
import { attachTestStripeProductionProviderObservation } from '@voucha/test-helpers/entities/memberships/provider-observations'
import { createTestMembership, createTestSku } from '@voucha/test-helpers/entities/memberships'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view-for-test'
import { getRevenue } from './get-revenue.mts'

async function refreshRevenue(): Promise<void> {
  await refreshMaterializedViewForTest('mv_revenue_memberships')
  await refreshMaterializedViewForTest('mv_revenue_changes')
}

describe('getRevenue native views', () => {
  it('uses the provider observation, not a newer catalog SKU, for MRR', async () => {
    const user = await createTestUser()
    const applicationId = `revenue-observation-${randomUUID()}`
    const observedSku = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      price_minor_units: 731,
      provider_application_id: applicationId,
    })
    const scope = { userIds: [user.id] }
    const context = { applicationId }
    const before = await getRevenue('all', new Date(0), scope, context)
    const membership = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      sku_id: observedSku.id,
      stripe_subscription_id: `sub_observed_revenue_${randomUUID()}`,
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
      price_minor_units: 10_731,
      provider_application_id: applicationId,
    })
    await refreshRevenue()
    const result = await getRevenue('all', new Date(0), scope, context)

    const usdBefore = before.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
    const usdAfter = result.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
    expect(BigInt(usdAfter) - BigInt(usdBefore)).toBe(7_310_000n)
  })

  it('counts a family membership without adding MRR', async () => {
    const familyUser = await createTestUser()
    const applicationId = `revenue-family-${randomUUID()}`
    const familySku = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      provider_application_id: applicationId,
    })
    const scope = { userIds: [familyUser.id] }
    const context = { applicationId }
    const before = await getRevenue('all', new Date(0), scope, context)
    await createTestFamilyMembership({
      applicationId,
      expiresAt: new Date(Date.now() + 86_400_000),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: familyUser.id,
    })
    await refreshRevenue()
    const after = await getRevenue('all', new Date(0), scope, context)

    expect(after.active_memberships).toBe(before.active_memberships + 1)
    expect(after.memberships_by_tier.plus).toBe((before.memberships_by_tier.plus ?? 0) + 1)
    expect(after.mrr_by_currency).toEqual(before.mrr_by_currency)
  })
})
