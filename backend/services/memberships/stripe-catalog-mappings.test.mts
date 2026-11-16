import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestSku,
  createTestUser,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import { createMembership } from './create-membership.mts'
import { getSkuByStripePriceIdForLifecycle } from './get-catalog.mts'
import { MAX_ACTIVE_MEMBERSHIP_PROVIDER_MAPPINGS } from './provider-catalog.mts'
import { publishStripeCatalogMapping } from './stripe-catalog-mappings.mts'

describe('membership catalog mapping capacity', () => {
  it('rejects insertion and reactivation above capacity and keeps a retired subscriber resolvable', async () => {
    const context = { environment: 'test' as const, applicationId: `catalog-cap-${randomUUID()}` }
    const mappings = []
    const seedSku = `catalog-old-${randomUUID()}`
    for (let index = 0; index < MAX_ACTIVE_MEMBERSHIP_PROVIDER_MAPPINGS; index++)
      mappings.push(
        await createTestSku({
          plan: 'plus',
          provider_environment: context.environment,
          provider_application_id: context.applicationId,
          sku_id: index === 0 ? seedSku : `catalog-seed-${randomUUID()}`,
        }),
      )
    const old = mappings[0]!
    const member = await createTestUser()
    const subscriptionId = `sub-cap-${randomUUID()}`
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: old.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: context.environment,
      providerApplicationId: context.applicationId,
    })
    const replacement = {
      membershipProductId: old.id,
      providerProductId: `price-cap-${randomUUID()}`,
      skuId: `catalog-cap-${randomUUID()}`,
      amount: 500,
      context,
    }
    await expect(publish(replacement)).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBERSHIP_CATALOG_MAPPING_LIMIT_REACHED',
    })
    await retireTestMembershipProviderProduct(old.membership_provider_product_id)
    await publish(replacement)
    await expect(
      publish({
        ...replacement,
        providerProductId: old.stripe_price_id,
        skuId: seedSku,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_CATALOG_MAPPING_LIMIT_REACHED' })
    await expect(
      getSkuByStripePriceIdForLifecycle(old.stripe_price_id, {
        provider: 'stripe',
        ...context,
        providerLineageId: subscriptionId,
      }),
    ).resolves.toMatchObject({ id: old.id, stripe_price_id: old.stripe_price_id })
  })
})

async function publish(options: Omit<Parameters<typeof publishStripeCatalogMapping>[0], 'query'>) {
  await using transaction = await beginTransaction()
  await publishStripeCatalogMapping({ ...options, query: transaction })
  await transaction.commit()
}
