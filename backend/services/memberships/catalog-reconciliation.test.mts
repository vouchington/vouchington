import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  clearTestStripeCatalogMappings,
  createConflictingTestStripeCatalogMapping,
  createTestMembership,
  createTestUser,
  getTestStripeCatalogMappings,
  runTestStripeCatalogReconciliationWhileProductReferenced,
} from '@voucha/test-helpers'
import { getSkuByStripePriceIdForLifecycle } from './get-catalog.mts'
import { reconcileStripeMembershipCatalog } from './stripe-catalog.mts'

const context = {
  applicationId: `stripe-catalog-test-${randomUUID()}`,
  environment: STRIPE_PROVIDER_ENVIRONMENT,
}
const expected = [
  {
    plan: 'plus',
    billing_interval: 'monthly',
    sku_id: 'voucha_membership_v1_plus_monthly_usd',
    price_minor_units: '500',
    currency_code: 'usd',
  },
  {
    plan: 'plus',
    billing_interval: 'yearly',
    sku_id: 'voucha_membership_v1_plus_yearly_usd',
    price_minor_units: '5000',
    currency_code: 'usd',
  },
  {
    plan: 'pro',
    billing_interval: 'monthly',
    sku_id: 'voucha_membership_v1_pro_monthly_usd',
    price_minor_units: '1000',
    currency_code: 'usd',
  },
  {
    plan: 'pro',
    billing_interval: 'yearly',
    sku_id: 'voucha_membership_v1_pro_yearly_usd',
    price_minor_units: '10000',
    currency_code: 'usd',
  },
]

function canonicalMappings(
  mappings: Awaited<ReturnType<typeof getTestStripeCatalogMappings>>,
): Array<
  (typeof expected)[number] & { provider_product_id: string; product_retired_at: Date | null }
> {
  return mappings
    .filter(mapping => mapping.retired_at === null)
    .map(mapping => {
      if (mapping.sku_id === null) throw new Error('Active Stripe catalog mapping has no SKU id')
      return {
        plan: mapping.plan,
        billing_interval: mapping.billing_interval,
        sku_id: mapping.sku_id,
        price_minor_units: mapping.price_minor_units,
        currency_code: mapping.currency_code,
        provider_product_id: mapping.provider_product_id,
        product_retired_at: mapping.product_retired_at,
      }
    })
}

function expectedCanonicalMappings(revision: string) {
  return expected.map(mapping => ({
    ...mapping,
    provider_product_id: `price_catalog_${revision}_${mapping.sku_id}`,
    product_retired_at: null,
  }))
}

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

  it('atomically publishes exact mappings and retains lifecycle lookup for replacements', async () => {
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual([])
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('first') })
    const first = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    expect(canonicalMappings(first)).toEqual(expectedCanonicalMappings('first'))

    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('second') })

    const mappings = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    const active = mappings.filter(mapping => mapping.retired_at === null)
    const retired = mappings.filter(mapping => mapping.retired_at !== null)
    expect(active).toHaveLength(4)
    expect(canonicalMappings(mappings)).toEqual(expectedCanonicalMappings('second'))
    expect(retired).toHaveLength(4)

    const replaced = retired.find(mapping => mapping.sku_id === expected[0]?.sku_id)
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
    const failedResolver = async (): Promise<never> => {
      throw new Error('Stripe unavailable')
    }

    await expect(
      reconcileStripeMembershipCatalog({ context, resolvePrice: failedResolver }),
    ).rejects.toThrow('Stripe unavailable')
    const afterFailure = await getTestStripeCatalogMappings(
      context.applicationId,
      context.environment,
    )
    expect(afterFailure.filter(mapping => mapping.retired_at === null)).toEqual([])

    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('retry') })
    const retried = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    expect(canonicalMappings(retried)).toEqual(expectedCanonicalMappings('retry'))
  })

  it('keeps publication, replacement, and fail-closed retirement in the supplied environment', async () => {
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
    const firstContextMappings = await getTestStripeCatalogMappings(
      oppositeContext.applicationId,
      oppositeContext.environment,
    )
    expect(canonicalMappings(firstContextMappings)).toEqual(
      expectedCanonicalMappings('opposite-first'),
    )
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual([])

    await reconcileStripeMembershipCatalog({
      context: oppositeContext,
      resolvePrice: resolvePrice('opposite-second'),
    })
    const replaced = await getTestStripeCatalogMappings(
      oppositeContext.applicationId,
      oppositeContext.environment,
    )
    expect(canonicalMappings(replaced)).toEqual(expectedCanonicalMappings('opposite-second'))
    expect(replaced.filter(mapping => mapping.retired_at !== null)).toHaveLength(4)

    await expect(
      reconcileStripeMembershipCatalog({ context: oppositeContext, resolvePrice: unavailable }),
    ).rejects.toThrow('Stripe unavailable')
    const afterFailure = await getTestStripeCatalogMappings(
      oppositeContext.applicationId,
      oppositeContext.environment,
    )
    expect(afterFailure.filter(mapping => mapping.retired_at === null)).toEqual([])
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual([])
  })

  it('reconciles while a canonical membership product is foreign-key referenced', async () => {
    await runTestStripeCatalogReconciliationWhileProductReferenced(() =>
      reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('fk-hold') }),
    )
    const mappings = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    expect(canonicalMappings(mappings)).toEqual(expectedCanonicalMappings('fk-hold'))
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
    expect(
      canonicalMappings(
        await getTestStripeCatalogMappings(context.applicationId, context.environment),
      ),
    ).toEqual(expectedCanonicalMappings('same'))
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
      err => err as Error,
    )
    await started
    const success = reconcileStripeMembershipCatalog({
      context,
      resolvePrice: resolvePrice('later-success'),
    })
    rejectFirst?.()

    await expect(failureOutcome).resolves.toMatchObject({ message: 'older provider failure' })
    await success
    const mappings = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    expect(canonicalMappings(mappings)).toEqual(expectedCanonicalMappings('later-success'))
  })

  it('rolls back every mapping when an existing catalog key points at another canonical product', async () => {
    await createConflictingTestStripeCatalogMapping(
      context.applicationId,
      expected[0]!.sku_id,
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
