import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { createTestSku } from '@voucha/test-helpers'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  MEMBERSHIP_PRODUCT_CACHE_PREFIXES,
  MEMBERSHIP_PRODUCT_CACHE_SCHEMA_VERSION,
  serializeMembershipProductCacheKey,
  type MembershipProductCacheKey,
} from './cache-schema.mts'
import type { StripeCatalogContext } from './get-catalog.mts'
import {
  getActivePlansCached,
  getSkuByStripePriceIdCached,
  invalidateMembershipProductCaches,
} from './get.mts'

const ONE_MINUTE_IN_SECONDS = 60

const currentCaches = {
  activePlans: new ValkeyCache<MembershipProductCacheKey>({
    prefix: MEMBERSHIP_PRODUCT_CACHE_PREFIXES.activePlans,
    ttlSeconds: ONE_MINUTE_IN_SECONDS,
    keySerializer: serializeMembershipProductCacheKey,
  }),
  byStripePriceId: new ValkeyCache<MembershipProductCacheKey>({
    prefix: MEMBERSHIP_PRODUCT_CACHE_PREFIXES.byStripePriceId,
    ttlSeconds: ONE_MINUTE_IN_SECONDS,
    keySerializer: serializeMembershipProductCacheKey,
  }),
}

const legacyCaches = {
  activePlans: new ValkeyCache<string>({
    prefix: 'membership_products_active',
    ttlSeconds: ONE_MINUTE_IN_SECONDS,
  }),
  byStripePriceId: new ValkeyCache<string>({
    prefix: 'membership_products_price',
    ttlSeconds: ONE_MINUTE_IN_SECONDS,
  }),
}

// Every SKU fixture in this file gets its own catalog context (a unique applicationId) so no
// two tests here — and no other unlocked fixture writer in the suite — can share a
// membership_provider_products row. See "Shared membership catalog rows" in
// backend/test-helpers/README.md.
function createCatalogContext(): StripeCatalogContext {
  return {
    environment: STRIPE_PROVIDER_ENVIRONMENT,
    applicationId: `test-get-cache-${randomUUID()}`,
  }
}

describe('membership SKU cache schema', () => {
  it('versions every cache that stores a membership SKU payload', () => {
    expect(MEMBERSHIP_PRODUCT_CACHE_SCHEMA_VERSION).toBe('provider-v1')
    expect(Object.values(MEMBERSHIP_PRODUCT_CACHE_PREFIXES)).toEqual([
      'membership_products:provider-v1:active_plans',
      'membership_products:provider-v1:by_stripe_price_id',
    ])
  })

  it('invalidates every membership product cache', async () => {
    const context = createCatalogContext()
    const keys = [
      currentCaches.activePlans.getKey({ ...context, value: 'active' }),
      currentCaches.byStripePriceId.getKey({
        ...context,
        value: 'price_test_cache_invalidation',
      }),
    ]

    try {
      await cacheValkeyClient.set(keys[0], '[]')
      await cacheValkeyClient.set(keys[1], '{}')

      await invalidateMembershipProductCaches()

      await expect(cacheValkeyClient.mget(keys)).resolves.toEqual([null, null])
    } finally {
      await cacheValkeyClient.unlink(keys)
    }
  })

  it('ignores legacy money payloads and fills the versioned caches', async () => {
    const context = createCatalogContext()
    const sku = await createTestSku({
      price_minor_units: 725,
      currency_code: 'usd',
      provider_environment: context.environment,
      provider_application_id: context.applicationId,
    })
    const keys = {
      currentActivePlans: currentCaches.activePlans.getKey({
        ...context,
        value: 'active',
      }),
      currentByStripePriceId: currentCaches.byStripePriceId.getKey({
        ...context,
        value: sku.stripe_price_id,
      }),
      legacyActivePlans: legacyCaches.activePlans.getKey('active'),
      legacyByStripePriceId: legacyCaches.byStripePriceId.getKey(sku.stripe_price_id),
    }
    const allKeys = Object.values(keys)
    const legacyPayload = JSON.stringify({
      id: 'legacy-sku',
      price_cents: 999,
      currency: 'usd',
    })

    try {
      await cacheValkeyClient.unlink(allKeys)
      await Promise.all([
        cacheValkeyClient.set(keys.legacyActivePlans, `[${legacyPayload}]`),
        cacheValkeyClient.set(keys.legacyByStripePriceId, legacyPayload),
      ])

      const [plans, byStripePriceId] = await Promise.all([
        getActivePlansCached(context),
        getSkuByStripePriceIdCached(sku.stripe_price_id, context),
      ])

      expect(plans.get(sku.plan)?.find(candidate => candidate.id === sku.id)?.price).toEqual({
        amount: 725,
        currency: 'usd',
      })
      expect(byStripePriceId?.price).toEqual({ amount: 725, currency: 'usd' })

      // keys.currentActivePlans is intentionally not asserted present: createTestSku globally
      // invalidates the activePlans cache prefix on every call (~430 call sites across the
      // suite), so a concurrent fixture writer anywhere can delete this key between the write
      // above and the read here. Only the uniquely-addressed byStripePriceId key is safe to
      // assert on.
      await expect.poll(() => cacheValkeyClient.get(keys.currentByStripePriceId)).not.toBeNull()
      await expect(
        Promise.all([
          cacheValkeyClient.get(keys.legacyActivePlans),
          cacheValkeyClient.get(keys.legacyByStripePriceId),
        ]),
      ).resolves.toEqual([`[${legacyPayload}]`, legacyPayload])
    } finally {
      await cacheValkeyClient.unlink(allKeys)
    }
  })

  it('does not share cached plans or prices across Stripe environments', async () => {
    const applicationId = `test-get-cache-${randomUUID()}`
    const testPriceId = `price_context_cache_test_${randomUUID()}`
    const productionPriceId = `price_context_cache_production_${randomUUID()}`
    const testContext: StripeCatalogContext = { environment: 'test', applicationId }
    const productionContext: StripeCatalogContext = { environment: 'production', applicationId }

    const testSku = await createTestSku({
      stripe_price_id: testPriceId,
      provider_environment: 'test',
      provider_application_id: applicationId,
    })
    const productionSku = await createTestSku({
      stripe_price_id: productionPriceId,
      provider_environment: 'production',
      provider_application_id: applicationId,
    })

    await expect(getSkuByStripePriceIdCached(testPriceId, productionContext)).resolves.toBeNull()
    await expect(getSkuByStripePriceIdCached(productionPriceId, testContext)).resolves.toBeNull()
    await expect(getSkuByStripePriceIdCached(testPriceId, testContext)).resolves.toMatchObject({
      id: testSku.id,
    })
    await expect(
      getSkuByStripePriceIdCached(productionPriceId, productionContext),
    ).resolves.toMatchObject({ id: productionSku.id })

    expect((await getActivePlansCached(productionContext)).get(testSku.plan) ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ stripe_price_id: testPriceId })]),
    )
    expect((await getActivePlansCached(testContext)).get(productionSku.plan) ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ stripe_price_id: productionPriceId })]),
    )
    expect((await getActivePlansCached(testContext)).get(testSku.plan)).toEqual(
      expect.arrayContaining([expect.objectContaining({ stripe_price_id: testPriceId })]),
    )
    expect((await getActivePlansCached(productionContext)).get(productionSku.plan)).toEqual(
      expect.arrayContaining([expect.objectContaining({ stripe_price_id: productionPriceId })]),
    )
  })
})
