import assert from 'node:assert'
import type Stripe from 'stripe'
import { createStripeClient } from '@vouchington/stripe'

import { getProviderFetch } from '@modules/api-egress-proxy'
import { STRIPE_SECRET_KEY } from '@voucha/config'

let stripeClient: Stripe | null = null

/* no-mistakes: integration=stripe */
export function getStripeClient(): Stripe {
  if (!stripeClient) {
    assert(STRIPE_SECRET_KEY, 'BUG: STRIPE_SECRET_KEY is not configured')
    stripeClient = createStripeClient({
      apiKey: STRIPE_SECRET_KEY,
      fetch: getProviderFetch('stripe_enabled'),
    })
  }
  return stripeClient
}
