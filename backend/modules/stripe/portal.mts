import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
  idempotencyKey?: string,
  cancellationSubscriptionId?: string,
): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
  const stripe = getStripeClient()
  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: customerId,
    return_url: returnUrl,
    ...(cancellationSubscriptionId && {
      flow_data: {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: cancellationSubscriptionId },
        after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
      },
    }),
  }
  if (!idempotencyKey) return stripe.billingPortal.sessions.create(params)
  return stripe.billingPortal.sessions.create(params, { idempotencyKey })
}
