import { describe, expect, it } from 'vitest'
import { getStripeClient } from './client.mts'

describe('stripe.client', () => {
  /**
   * Credentialed happy-path test for Stripe connectivity.
   * Calls a read-only endpoint (balance.retrieve) — no data is created.
   * Other Stripe tests are in *.mock.test.mts (mocked client).
   */

  it(
    'connects to Stripe and retrieves balance',
    /* no-mistakes: integration=stripe */
    async () => {
      if (!process.env.STRIPE_SECRET_KEY?.trim()) {
        throw new Error('STRIPE_SECRET_KEY is required for this credentialed test.')
      }
      const stripe = getStripeClient()
      const balance = await stripe.balance.retrieve()
      expect(balance.object).toBe('balance')
    },
    30_000,
  )
})
