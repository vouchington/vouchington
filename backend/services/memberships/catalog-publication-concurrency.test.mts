import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { clearTestStripeCatalogMappings, getTestStripeCatalogMappings } from '@voucha/test-helpers'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { reconcileStripeMembershipCatalog } from './stripe-catalog.mts'

const context = {
  applicationId: `stripe-publication-test-${randomUUID()}`,
  environment: STRIPE_PROVIDER_ENVIRONMENT,
}

function resolvePrice(revision: string) {
  return async ({ lookupKey }: { lookupKey: string }) =>
    ({ id: `price_catalog_${revision}_${lookupKey}` }) as Awaited<
      ReturnType<typeof import('@modules/stripe/catalog').resolveRecurringCatalogPrice>
    >
}

describe('concurrent Stripe catalog publication', () => {
  afterEach(async () => {
    await clearTestStripeCatalogMappings(context.applicationId)
  })

  it('publishes unrelated contexts concurrently', async () => {
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('old') })
    const baseline = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    const otherContext = { ...context, applicationId: `stripe-publication-test-${randomUUID()}` }
    try {
      const outcomes = await Promise.allSettled([
        reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('new') }),
        reconcileStripeMembershipCatalog({
          context: otherContext,
          resolvePrice: resolvePrice('new'),
        }),
      ])
      expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
      const first = await getTestStripeCatalogMappings(context.applicationId, context.environment)
      const other = await getTestStripeCatalogMappings(
        otherContext.applicationId,
        otherContext.environment,
      )
      const expected = baseline.map(mapping => ({
        ...mapping,
        provider_product_id: `price_catalog_new_${mapping.sku_id}`,
      }))
      expect(baseline).toHaveLength(4)
      expect(first.filter(mapping => mapping.retired_at === null)).toEqual(expected)
      expect(other).toEqual(expected)
    } finally {
      await clearTestStripeCatalogMappings(otherContext.applicationId)
    }
  })

  it('rejects a stale selected mapping without retiring the winning complete catalog', async () => {
    await reconcileStripeMembershipCatalog({ context, resolvePrice: resolvePrice('old') })
    const baseline = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    const plusSku = 'voucha_membership_v1_plus_monthly_usd'
    const proSku = 'voucha_membership_v1_pro_monthly_usd'
    const replacementPriceId = `price_catalog_new_${plusSku}`
    const stalePriceId = `price_catalog_old_${plusSku}`
    const inserted = Promise.withResolvers<void>()
    const staleRead = Promise.withResolvers<void>()
    const releaseInsert = Promise.withResolvers<void>()
    const releaseRead = Promise.withResolvers<void>()
    let selectedReads = 0
    const restoreInsert = afterPostgresTransactionQueryForTest(
      '/* publishStripeCatalogMapping: insert */',
      values => values.includes(replacementPriceId),
      async () => {
        inserted.resolve()
        await releaseInsert.promise
      },
    )
    let restoreRead = () => {}
    const first = reconcileStripeMembershipCatalog({
      context,
      resolvePrice: async descriptor =>
        resolvePrice(descriptor.lookupKey === plusSku ? 'new' : 'old')(descriptor),
    })
    const firstOutcome = first.then(() => null).catch((err: unknown) => err)
    let secondOutcome: Promise<unknown> | undefined
    try {
      await Promise.race([
        inserted.promise,
        first.then(() => {
          throw new Error('First publication skipped insert barrier')
        }),
      ])
      restoreInsert()
      restoreRead = afterPostgresTransactionQueryForTest(
        '/* findStripeCatalogMappings */',
        values => values.includes(stalePriceId) && ++selectedReads === 2,
        async () => {
          staleRead.resolve()
          await releaseRead.promise
        },
      )
      const second = reconcileStripeMembershipCatalog({
        context,
        resolvePrice: async descriptor =>
          resolvePrice(descriptor.lookupKey === proSku ? 'new' : 'old')(descriptor),
      })
      secondOutcome = second.then(() => null).catch((err: unknown) => err)
      await Promise.race([
        staleRead.promise,
        second.then(() => {
          throw new Error('Second publication skipped stale read barrier')
        }),
      ])
      releaseInsert.resolve()
      await first
      releaseRead.resolve()
      const outcome = await secondOutcome
      const mappings = await getTestStripeCatalogMappings(
        context.applicationId,
        context.environment,
      )
      expect(mappings.filter(mapping => mapping.retired_at === null)).toEqual(
        baseline.map(mapping => ({
          ...mapping,
          provider_product_id:
            mapping.sku_id === plusSku ? replacementPriceId : mapping.provider_product_id,
        })),
      )
      expect(baseline).toHaveLength(4)
      expect(mappings).toHaveLength(5)
      expect(mappings).toContainEqual(
        expect.objectContaining({
          provider_product_id: stalePriceId,
          retired_at: expect.any(Date),
        }),
      )
      expect(outcome).toMatchObject({
        statusCode: 409,
        code: 'MEMBERSHIP_CATALOG_CONFLICT',
        cause: { code: '23505', constraint: 'idx_membership_provider_products__active_sku' },
      })
    } finally {
      releaseInsert.resolve()
      releaseRead.resolve()
      await Promise.all([firstOutcome, secondOutcome])
      restoreRead()
      restoreInsert()
    }
  })
})
