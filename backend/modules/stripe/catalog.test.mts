import Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { resolveRecurringCatalogPrice } from './catalog.mts'

const descriptor = {
  lookupKey: 'voucha_membership_v1_plus_monthly_usd',
  productName: 'Voucha Plus Monthly',
  unitAmount: 500,
  interval: 'month' as const,
}

function makePrice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price_plus_monthly',
    active: true,
    currency: 'usd',
    lookup_key: descriptor.lookupKey,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    billing_scheme: 'per_unit',
    transform_quantity: null,
    unit_amount: 500,
    product: {
      active: true,
      deleted: false,
      metadata: {
        voucha_catalog_lookup_key: descriptor.lookupKey,
        voucha_catalog_version: 'v1',
      },
      name: descriptor.productName,
    },
    ...overrides,
  }
}

function installStripeClient({
  listed = [],
  created = makePrice(),
}: {
  listed?: unknown[]
  created?: unknown
}) {
  const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: listed })
  const create = vi.fn<VitestLooseMock>().mockResolvedValue(created)
  const retrieve = vi.fn<VitestLooseMock>()
  vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
    prices: { create, list },
    products: { retrieve },
  } as never)
  return { create, list, retrieve }
}

describe('resolveRecurringCatalogPrice', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reuses an exact active price without creating another one', async () => {
    const { create, list } = installStripeClient({ listed: [makePrice()] })

    await expect(resolveRecurringCatalogPrice(descriptor)).resolves.toMatchObject({
      id: 'price_plus_monthly',
    })
    expect(create).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledWith({
      lookup_keys: [descriptor.lookupKey],
      expand: ['data.product'],
      limit: 2,
    })
  })

  it('creates the missing product and price with immutable ownership metadata', async () => {
    const { create } = installStripeClient({ listed: [] })

    await resolveRecurringCatalogPrice(descriptor)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'usd',
        lookup_key: descriptor.lookupKey,
        product_data: {
          name: descriptor.productName,
          metadata: {
            voucha_catalog_lookup_key: descriptor.lookupKey,
            voucha_catalog_version: 'v1',
          },
        },
      }),
      { idempotencyKey: `voucha-membership-${descriptor.lookupKey}` },
    )
  })

  it.each([
    ['inactive', makePrice({ active: false })],
    ['immutable mismatch', makePrice({ unit_amount: 501 })],
    [
      'metered usage',
      makePrice({ recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } }),
    ],
    ['tiered billing', makePrice({ billing_scheme: 'tiered' })],
    ['quantity transform', makePrice({ transform_quantity: { divide_by: 2, round: 'up' } })],
    [
      'ownership mismatch',
      makePrice({
        product: { ...makePrice().product, metadata: { voucha_catalog_version: 'v1' } },
      }),
    ],
  ])('rejects an %s catalog price', async (_name, price) => {
    installStripeClient({ listed: [price] })

    await expect(resolveRecurringCatalogPrice(descriptor)).rejects.toThrow(
      /inactive|does not match the immutable v1 descriptor/,
    )
  })

  it('refetches once only for Stripe lookup-key conflict evidence', async () => {
    const race = new Stripe.errors.StripeInvalidRequestError({
      code: 'resource_already_exists',
      message: 'duplicate',
      param: 'lookup_key',
      type: 'invalid_request_error',
    })
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [makePrice()] })
    const create = vi.fn<VitestLooseMock>().mockRejectedValue(race)
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      prices: { create, list },
      products: { retrieve: vi.fn<VitestLooseMock>() },
    } as never)

    await expect(resolveRecurringCatalogPrice(descriptor)).resolves.toMatchObject({
      id: 'price_plus_monthly',
    })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('propagates arbitrary create failures without refetching', async () => {
    const { list, create } = installStripeClient({ listed: [] })
    create.mockRejectedValue(new Error('temporary provider outage'))

    await expect(resolveRecurringCatalogPrice(descriptor)).rejects.toThrow(
      'temporary provider outage',
    )
    expect(list).toHaveBeenCalledTimes(1)
  })
})
