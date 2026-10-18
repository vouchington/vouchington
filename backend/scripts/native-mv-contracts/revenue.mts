import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { attachTestStripeProductionProviderObservation } from '../../test-helpers/entities/memberships/provider-observations.mts'
import { createTestFamilyMembership } from '../../test-helpers/entities/memberships/family.mts'
import { createTestMembership, createTestSku } from '../../test-helpers/entities/memberships.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { getRevenue } from '@services/growth-metrics/get-revenue'

async function refreshRevenue(): Promise<void> {
  await refreshMaterializedView('mv_revenue_memberships')
  await refreshMaterializedView('mv_revenue_changes')
}

export async function checkRevenueContracts(): Promise<void> {
  const user = await createTestUser()
  const observedPriceMinorUnits = 731
  const applicationId = `revenue-observation-${randomUUID()}`
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
    price_minor_units: observedPriceMinorUnits + 10_000,
    provider_application_id: applicationId,
  })
  await refreshRevenue()
  const result = await getRevenue('all', new Date(0), scope, context)
  const usdBefore = before.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
  const usdAfter = result.mrr_by_currency.find(row => row.currency === 'usd')?.amount ?? '0'
  assert.equal(
    BigInt(usdAfter) - BigInt(usdBefore),
    BigInt(observedPriceMinorUnits) * 10_000n,
    'MRR must use the provider observation, not a newer catalog SKU',
  )

  const familyUser = await createTestUser()
  const familyApplicationId = `revenue-family-${randomUUID()}`
  const familyContext = { applicationId: familyApplicationId }
  const familySku = await createTestSku({
    plan: 'plus',
    interval: 'monthly',
    provider_application_id: familyApplicationId,
  })
  const familyScope = { userIds: [familyUser.id] }
  const familyBefore = await getRevenue('all', new Date(0), familyScope, familyContext)
  await createTestFamilyMembership({
    applicationId: familyApplicationId,
    expiresAt: new Date(Date.now() + 86_400_000),
    membershipProductId: familySku.id,
    membershipProviderProductId: familySku.membership_provider_product_id,
    userId: familyUser.id,
  })
  await refreshRevenue()
  const familyAfter = await getRevenue('all', new Date(0), familyScope, familyContext)
  assert.equal(familyAfter.active_memberships, familyBefore.active_memberships + 1)
  assert.equal(
    familyAfter.memberships_by_tier.plus,
    (familyBefore.memberships_by_tier.plus ?? 0) + 1,
  )
  assert.deepEqual(familyAfter.mrr_by_currency, familyBefore.mrr_by_currency)
}
