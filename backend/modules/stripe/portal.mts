import type Stripe from 'stripe'
import { buildBillingPortalParams, idempotencyOptions } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
  idempotencyKey?: string,
  cancellationSubscriptionId?: string,
): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
  const stripe = getStripeClient()
  return stripe.billingPortal.sessions.create(
    buildBillingPortalParams({ customerId, returnUrl, cancellationSubscriptionId }),
    idempotencyOptions(idempotencyKey),
  )
}
