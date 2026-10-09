import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createProviderReplay } from '../../test-helpers/provider-replay.mts'
import {
  createReplayStripeClient,
  loadStripeFixture,
  stripeFormBody,
  stripeQuery,
} from '../../test-helpers/stripe-replay.mts'
import { resolveRecurringCatalogPrice } from './catalog.mts'

// The recorded Stripe responses are served through the real Stripe SDK, so it serializes our
// requests and parses actual wire bytes, including Stripe's error body. ./catalog.test.mts keeps
// the validation matrix against hand-built prices. Stripe enforcing its own idempotency key and
// lookup-key uniqueness stays with the live smoke checks.
const replay = createProviderReplay()
const stripe = createReplayStripeClient(replay.fetch)

const descriptor = {
  lookupKey: 'voucha_membership_v1_plus_monthly_usd',
  productName: 'Voucha Plus Monthly',
  unitAmount: 500,
  interval: 'month' as const,
}

describe('resolveRecurringCatalogPrice against recorded Stripe responses', () => {
  beforeEach(() => {
    replay.reset()
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(stripe)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses the active price Stripe lists for the lookup key without creating another', async () => {
    replay.respondWith(loadStripeFixture('prices-list-plus-monthly.http'))

    await expect(resolveRecurringCatalogPrice(descriptor)).resolves.toMatchObject({
      id: 'price_plus_monthly',
      lookup_key: descriptor.lookupKey,
    })

    expect(replay.requests.map(request => request.method)).toEqual(['GET'])
    const query = stripeQuery(replay.requests[0]!)
    expect(query.get('lookup_keys[0]')).toBe(descriptor.lookupKey)
    expect(query.get('expand[0]')).toBe('data.product')
    expect(query.get('limit')).toBe('2')
    replay.assertDrained()
  })

  it('creates the product and price under a stable idempotency key, then validates the product Stripe returns by id', async () => {
    replay.respondWith(
      loadStripeFixture('prices-list-empty.http'),
      loadStripeFixture('price-created-plus-monthly.http'),
      loadStripeFixture('product-plus-monthly.http'),
    )

    await expect(resolveRecurringCatalogPrice(descriptor)).resolves.toMatchObject({
      id: 'price_plus_monthly',
    })

    // A created price names its product by id, so the descriptor is checked against a retrieve.
    expect(replay.requests.map(request => request.method)).toEqual(['GET', 'POST', 'GET'])
    const create = replay.requests[1]!
    expect(create.headers['idempotency-key']).toBe(`voucha-membership-${descriptor.lookupKey}`)
    const form = stripeFormBody(create)
    expect(Object.fromEntries(form)).toEqual({
      currency: 'usd',
      unit_amount: '500',
      'recurring[interval]': 'month',
      'recurring[interval_count]': '1',
      lookup_key: descriptor.lookupKey,
      'product_data[name]': descriptor.productName,
      'product_data[metadata][voucha_catalog_lookup_key]': descriptor.lookupKey,
      'product_data[metadata][voucha_catalog_version]': 'v1',
    })
    replay.assertDrained()
  })

  it('reads the winner once and reuses it when Stripe reports the lookup key already exists', async () => {
    replay.respondWith(
      loadStripeFixture('prices-list-empty.http'),
      loadStripeFixture('price-create-lookup-key-exists-400.http'),
      loadStripeFixture('prices-list-plus-monthly.http'),
    )

    await expect(resolveRecurringCatalogPrice(descriptor)).resolves.toMatchObject({
      id: 'price_plus_monthly',
    })

    expect(replay.requests.map(request => request.method)).toEqual(['GET', 'POST', 'GET'])
    expect(stripeQuery(replay.requests[2]!).get('lookup_keys[0]')).toBe(descriptor.lookupKey)
    replay.assertDrained()
  })

  it('surfaces any other create rejection without reading the catalog again', async () => {
    replay.respondWith(
      loadStripeFixture('prices-list-empty.http'),
      loadStripeFixture('price-create-parameter-missing-400.http'),
    )

    await expect(resolveRecurringCatalogPrice(descriptor)).rejects.toMatchObject({
      code: 'parameter_missing',
      param: 'currency',
    })

    expect(replay.requests.map(request => request.method)).toEqual(['GET', 'POST'])
    replay.assertDrained()
  })
})
