import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { clearTestStripeCatalogMappings, getTestStripeCatalogMappings } from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { reconcileStripeMembershipCatalog } from './stripe-catalog.mts'

const context = {
  applicationId: `stripe-catalog-retirement-failure-${randomUUID()}`,
  environment: STRIPE_PROVIDER_ENVIRONMENT,
}

function resolvePrice(revision: string) {
  return async ({ lookupKey }: { lookupKey: string }) =>
    ({ id: `price_catalog_${revision}_${lookupKey}` }) as Awaited<
      ReturnType<typeof import('@modules/stripe/catalog').resolveRecurringCatalogPrice>
    >
}

describe('Stripe membership catalog retirement failures', () => {
  afterEach(async () => {
    await clearTestStripeCatalogMappings(context.applicationId)
  })

  it('preserves provider and database failures when fail-closed retirement also fails', async () => {
    await reconcileStripeMembershipCatalog({
      context,
      resolvePrice: resolvePrice('before-failure'),
    })
    const before = await getTestStripeCatalogMappings(context.applicationId, context.environment)
    const providerFailure = new Error('Stripe unavailable')
    const { result: aggregate, error: retirementFailure } = await withPostgresQueryFailureForTest(
      '/* reconcileStripeMembershipCatalog: fail closed */',
      async () => {
        try {
          await reconcileStripeMembershipCatalog({
            context,
            resolvePrice: async (): Promise<never> => {
              throw providerFailure
            },
          })
        } catch (err) {
          return err
        }
        throw new Error('Expected catalog reconciliation to fail')
      },
      { command: 'UPDATE' },
    )

    expect(aggregate).toBeInstanceOf(AggregateError)
    if (!(aggregate instanceof AggregateError)) throw new Error('Expected AggregateError')
    expect(aggregate.errors[0]).toBe(providerFailure)
    expect(aggregate.errors[1]).toBe(retirementFailure)
    expect(aggregate.cause).toBe(retirementFailure)
    await expect(
      getTestStripeCatalogMappings(context.applicationId, context.environment),
    ).resolves.toEqual(before)
  })
})
