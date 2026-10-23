import type Stripe from 'stripe'
import { buildPauseCollectionParams, SUBSCRIPTION_SCHEDULE_EXPAND } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function getStripeSubscription(id: string): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  return stripe.subscriptions.retrieve(id, {
    expand: SUBSCRIPTION_SCHEDULE_EXPAND,
  })
}

/* no-mistakes: integration=stripe */
export function updateStripeSubscriptionPauseCollection(
  id: string,
  behavior: 'void' | 'clear',
  idempotencyKey: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  const params = buildPauseCollectionParams(behavior)
  return stripe.subscriptions.update(id, params, { idempotencyKey })
}

/* no-mistakes: integration=stripe */
export async function cancelStripeSubscriptionImmediately(
  id: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  const stripe = getStripeClient()
  try {
    return await stripe.subscriptions.cancel(id)
  } catch (err) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id)
      if (subscription.status === 'canceled') return subscription
    } catch {
      // Preserve the original DELETE failure. Retrieval is only a convergence check.
    }
    throw err
  }
}
