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
})
