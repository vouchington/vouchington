import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  clearTestStripeCatalogMappings,
  createConflictingTestStripeCatalogMapping,
  createTestMembership,
  createTestUser,
  getTestStripeCatalogMappings,
} from '@voucha/test-helpers'
import { getActivePlansCached, getSkuByStripePriceIdForLifecycle } from './get-catalog.mts'
import {
  isStripeMembershipCatalogReady,
  reconcileStripeMembershipCatalog,
} from './stripe-catalog.mts'

const context = {
  applicationId: `stripe-catalog-test-${randomUUID()}`,
  environment: STRIPE_PROVIDER_ENVIRONMENT,
}
const expected = [
  'voucha_membership_v1_plus_monthly_usd',
  'voucha_membership_v1_plus_yearly_usd',
  'voucha_membership_v1_pro_monthly_usd',
  'voucha_membership_v1_pro_yearly_usd',
]

function resolvePrice(revision: string) {
  return async ({ lookupKey }: { lookupKey: string }) =>
    ({ id: `price_catalog_${revision}_${lookupKey}` }) as Awaited<
      ReturnType<typeof import('@modules/stripe/catalog').resolveRecurringCatalogPrice>
    >
}

describe('Stripe membership catalog reconciliation', () => {
  afterEach(async () => {
    await clearTestStripeCatalogMappings(context.applicationId)
  })

  it('atomically publishes exact mappings, refreshes the cache, and retains lifecycle lookup for replacements', async () => {
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(false)

    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('first') })
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(true)
    await expect(getActivePlansCached(context)).resolves.toSatisfy(plans =>
      [...plans.values()].flat().every(sku => sku.stripe_price_id.includes('_first_')),
    )

    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('second') })

    const mappings = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    const active = mappings.filter(mapping => mapping.retired_at === null)
    const retired = mappings.filter(mapping => mapping.retired_at !== null)
    expect(active).toHaveLength(4)
    expect(active.map(mapping => mapping.sku_id).sort()).toEqual(expected)
    expect(active.every(mapping => mapping.provider_product_id.includes('_second_'))).toBe(true)
    expect(retired).toHaveLength(4)
    await expect(getActivePlansCached(context)).resolves.toSatisfy(plans =>
      [...plans.values()].flat().every(sku => sku.stripe_price_id.includes('_second_')),
    )

    const replaced = retired.find(mapping => mapping.sku_id === expected[0])
    if (!replaced) throw new Error('Expected retired plus monthly Stripe mapping')
    const user = await createTestUser()
    const membership = await createTestMembership({
      user_id: user.id,
      sku_id: replaced.membership_product_id,
      stripe_customer_id: `cus_catalog_${randomUUID()}`,
      provider_environment: context.environment,
      provider_application_id: context.applicationId,
    })
    await expect(
      getSkuByStripePriceIdForLifecycle(replaced.provider_product_id, {
        provider: 'stripe',
        environment: context.environment,
        applicationId: context.applicationId,
        providerLineageId: membership.stripe_subscription_id!,
      }),
    ).resolves.toMatchObject({ id: replaced.membership_product_id })
  })

  it('fails closed after provider validation fails, then republishes on retry', async () => {
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('ready') })
    await getActivePlansCached(context)
    const failedResolver = async (): Promise<never> => {
      throw new Error('Stripe unavailable')
    }

    await expect(
      reconcileStripeMembershipCatalog({ context, resolvePrice: failedResolver }),
    ).rejects.toThrow('Stripe unavailable')
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(false)
    await expect(getActivePlansCached(context)).resolves.toEqual(new Map())

    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('retry') })
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(true)
    await expect(getActivePlansCached(context)).resolves.toSatisfy(plans =>
      [...plans.values()].flat().every(sku => sku.stripe_price_id.includes('_retry_')),
    )
  })

  it('keeps publication, replacement, readiness, and fail-closed retirement in the supplied environment', async () => {
    const oppositeContext = {
      ...context,
      environment: context.environment === 'test' ? ('production' as const) : ('test' as const),
    }
    const unavailable = async (): Promise<never> => {
      throw new Error('Stripe unavailable')
    }

    await reconcileStripeMembershipCatalog({
      context: oppositeContext,
      resolvePrice: resolvePrice('opposite-first'),
    })
    await expect(isStripeMembershipCatalogReady(oppositeContext)).resolves.toBe(true)
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(false)

    await reconcileStripeMembershipCatalog({
      context: oppositeContext,
      resolvePrice: resolvePrice('opposite-second'),
    })
    const replaced = await getTestStripeCatalogMappings(
      oppositeContext.applicationId,
      oppositeContext.environment,
    )
    expect(replaced.filter(mapping => mapping.retired_at === null)).toHaveLength(4)
    expect(replaced.filter(mapping => mapping.retired_at !== null)).toHaveLength(4)

    await expect(
      reconcileStripeMembershipCatalog({ context: oppositeContext, resolvePrice: unavailable }),
    ).rejects.toThrow('Stripe unavailable')
    await expect(isStripeMembershipCatalogReady(oppositeContext)).resolves.toBe(false)
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual([])
  })

  it('serializes concurrent repeat reconciliations into one active catalog', async () => {
    await Promise.all([
      reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('same') }),
      reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('same') }),
    ])

    const active = (
      await getTestStripeCatalogMappings(context.applicationId, context.environment)
    ).filter(mapping => mapping.retired_at === null)
    expect(active).toHaveLength(4)
    expect(active.map(mapping => mapping.sku_id).sort()).toEqual(expected)
  })

  it('serializes a failed run before a later successful run', async () => {
    let rejectFirst: (() => void) | undefined
    let firstStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => {
      firstStarted = resolve
    })
    const release = new Promise<void>(resolve => {
      rejectFirst = resolve
    })
    const failingResolver = async (): Promise<never> => {
      firstStarted?.()
      await release
      throw new Error('older provider failure')
    }

    const failure = reconcileStripeMembershipCatalog({
      context,
      resolvePrice: failingResolver,
    })
    const failureOutcome = failure.then(
      () => null,
      error => error as Error,
    )
    await started
    const success = reconcileStripeMembershipCatalog({
      context,
      resolvePrice: resolvePrice('later-success'),
    })
    rejectFirst?.()

    await expect(failureOutcome).resolves.toMatchObject({ message: 'older provider failure' })
    await success
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(true)
  })

  it('retries a post-commit cache invalidation failure without republishing stale prices', async () => {
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('first') })
    await getActivePlansCached(context)
    let invalidationAttempts = 0
    const failFirstInvalidation = async (): Promise<void> => {
      invalidationAttempts += 1
      if (invalidationAttempts === 1) throw new Error('Valkey unavailable')
    }

    await expect(
      reconcileStripeMembershipCatalog({
        context,
        resolvePrice: resolvePrice('second'),
        invalidateCaches: failFirstInvalidation,
      }),
    ).rejects.toThrow('Valkey unavailable')
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(false)
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('second') })
    await expect(getActivePlansCached(context)).resolves.toSatisfy(plans =>
      [...plans.values()].flat().every(sku => sku.stripe_price_id.includes('_second_')),
    )
  })

  it('preserves provider and disable failures when cache invalidation cannot complete', async () => {
    const providerError = new Error('provider failed')
    const cacheError = new Error('cache failed')
    const failedResolver = async (): Promise<never> => {
      throw providerError
    }
    const failedInvalidation = async (): Promise<never> => {
      throw cacheError
    }

    const outcome = reconcileStripeMembershipCatalog({
      context,
      resolvePrice: failedResolver,
      invalidateCaches: failedInvalidation,
    }).catch(error => error as AggregateError)

    await expect(outcome).resolves.toMatchObject({
      errors: [providerError, cacheError],
      cause: cacheError,
    })
    await expect(isStripeMembershipCatalogReady(context)).resolves.toBe(false)
  })

  it('rolls back every mapping when an existing catalog key points at another canonical product', async () => {
    await createConflictingTestStripeCatalogMapping(
      context.applicationId,
      expected[0]!,
      STRIPE_PROVIDER_ENVIRONMENT,
    )

    await expect(
      reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('conflict') }),
    ).rejects.toThrow('conflicts with its canonical identity')
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual([expect.objectContaining({ provider_product_id: 'price_catalog_conflict' })])
  })
})
