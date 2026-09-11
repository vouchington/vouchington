import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function getStripeSubscription(id: string): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  return stripe.subscriptions.retrieve(id, {
    expand: ['schedule.phases.items.price'],
  })
}

/* no-mistakes: integration=stripe */
export function cancelStripeSubscription(
  id: string,
  idempotencyKey?: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  const params = { cancel_at_period_end: true }
  if (!idempotencyKey) return stripe.subscriptions.update(id, params)
  return stripe.subscriptions.update(id, params, { idempotencyKey })
}

/* no-mistakes: integration=stripe */
export async function cancelStripeSubscriptionImmediately(
  id: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  try {
    return await stripe.subscriptions.cancel(id)
  } catch (cancelError) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id)
      if (subscription.status === 'canceled') return subscription
    } catch {
      // Preserve the original DELETE failure. Retrieval is only a convergence check.
    }
    throw cancelError
  }
}
