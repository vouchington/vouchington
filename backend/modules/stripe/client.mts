import assert from 'node:assert'
import Stripe from 'stripe'

import { getProviderFetch } from '@modules/api-egress-proxy'
import { STRIPE_SECRET_KEY } from '@voucha/config'

let stripeClient: Stripe | null = null
const STRIPE_OPERATION_TIMEOUT_MS = 10_000

/* no-mistakes: integration=stripe */
export function getStripeClient(): Stripe {
  if (!stripeClient) {
    assert(STRIPE_SECRET_KEY, 'BUG: STRIPE_SECRET_KEY is not configured')
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(getProviderFetch('stripe_enabled')),
      timeout: STRIPE_OPERATION_TIMEOUT_MS,
    })
  }
  return stripeClient
}
