import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
  idempotencyKey?: string,
): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
  const stripe = getStripeClient()
  const params = { customer: customerId, return_url: returnUrl }
  if (!idempotencyKey) return stripe.billingPortal.sessions.create(params)
  return stripe.billingPortal.sessions.create(params, { idempotencyKey })
}
