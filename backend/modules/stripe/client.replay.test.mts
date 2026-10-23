import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderReplay } from '../../test-helpers/provider-replay.mts'
import { STRIPE_REPLAY_SECRET_KEY, loadStripeFixture } from '../../test-helpers/stripe-replay.mts'

// The recorded Stripe response is served through the `fetch` that `getStripeClient()` asks the
// egress transport for, so the real Stripe SDK serializes the request and parses actual wire
// bytes. The live counterpart is the non-gating smoke check in ./client.stripe.test.mts.
const replay = createProviderReplay()

describe('getStripeClient against recorded Stripe responses', () => {
  beforeEach(() => {
    replay.reset()
    vi.stubEnv('STRIPE_SECRET_KEY', STRIPE_REPLAY_SECRET_KEY)
    // A fresh module graph reads the stubbed key and starts without a module-level client.
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('sends SDK traffic through the stripe-enabled transport, authenticated with the configured key', async () => {
    const apiEgressProxy = await import('@modules/api-egress-proxy')
    const getProviderFetch = vi
      .spyOn(apiEgressProxy, 'getProviderFetch')
      .mockReturnValue(replay.fetch)
    const { getStripeClient } = await import('./client.mts')
    replay.respondWith(loadStripeFixture('balance.http'))

    const balance = await getStripeClient().balance.retrieve()

    expect(balance).toMatchObject({
      object: 'balance',
      livemode: false,
      available: [{ amount: 4210, currency: 'usd' }],
    })
    // The provider key lets a DynamicConfig change reroute Stripe through the egress proxy.
    expect(getProviderFetch).toHaveBeenCalledExactlyOnceWith('stripe_enabled')
    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'GET',
      headers: { authorization: `Bearer ${STRIPE_REPLAY_SECRET_KEY}` },
    })
    // One module-level client: later calls neither rebuild it nor pick a transport again.
    expect(getStripeClient()).toBe(getStripeClient())
    expect(getProviderFetch).toHaveBeenCalledOnce()
    replay.assertDrained()
  })

  it('routes checkout and billing portal operations through the configured egress client', async () => {
    const apiEgressProxy = await import('@modules/api-egress-proxy')
    const getProviderFetch = vi
      .spyOn(apiEgressProxy, 'getProviderFetch')
      .mockReturnValue(replay.fetch)
    const { createCheckoutSession, createOneTimeCheckoutSession } = await import('./checkout.mts')
    const { createBillingPortalSession } = await import('./portal.mts')
    const providerError = loadStripeFixture('price-create-parameter-missing-400.http')
    replay.respondWith(providerError, providerError, providerError)

    // A recorded provider rejection exercises our transport and error propagation without
    // duplicating the published package's request-builder or response-parser test matrix.
    await expect(
      createCheckoutSession({
        customerId: 'cus_replay',
        priceId: 'price_replay',
        successUrl: 'https://voucha.ai/my/membership',
        cancelUrl: 'https://voucha.ai/my/membership',
        metadata: { user_id: 'user_replay' },
        idempotencyKey: 'subscription-checkout',
      }),
    ).rejects.toMatchObject({ code: 'parameter_missing', requestId: 'req_replay_fixture' })
    await expect(
      createOneTimeCheckoutSession({
        customerId: 'cus_replay',
        priceAmountMinorUnits: 500,
        currency: 'usd',
        productName: 'Voucha Plus',
        successUrl: 'https://voucha.ai/my/membership',
        cancelUrl: 'https://voucha.ai/my/membership',
        metadata: { user_id: 'user_replay' },
        idempotencyKey: 'one-time-checkout',
      }),
    ).rejects.toMatchObject({ code: 'parameter_missing', requestId: 'req_replay_fixture' })
    await expect(
      createBillingPortalSession('cus_replay', 'https://voucha.ai/my/membership', 'billing-portal'),
    ).rejects.toMatchObject({ code: 'parameter_missing', requestId: 'req_replay_fixture' })

    expect(
      replay.requests.map(request => ({
        method: request.method,
        path: new URL(request.url).pathname,
        key: request.headers['idempotency-key'],
        authorization: request.headers.authorization,
      })),
    ).toEqual([
      {
        method: 'POST',
        path: '/v1/checkout/sessions',
        key: 'subscription-checkout',
        authorization: `Bearer ${STRIPE_REPLAY_SECRET_KEY}`,
      },
      {
        method: 'POST',
        path: '/v1/checkout/sessions',
        key: 'one-time-checkout',
        authorization: `Bearer ${STRIPE_REPLAY_SECRET_KEY}`,
      },
      {
        method: 'POST',
        path: '/v1/billing_portal/sessions',
        key: 'billing-portal',
        authorization: `Bearer ${STRIPE_REPLAY_SECRET_KEY}`,
      },
    ])
    expect(getProviderFetch).toHaveBeenCalledExactlyOnceWith('stripe_enabled')
    replay.assertDrained()
  })
})
