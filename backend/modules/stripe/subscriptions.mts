import type Stripe from 'stripe'
import {
  buildPauseCollectionParams,
  cancelStripeSubscription,
  SUBSCRIPTION_SCHEDULE_EXPAND,
} from '@vouchington/stripe'
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
export function cancelStripeSubscriptionImmediately(
  id: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  return cancelStripeSubscription(getStripeClient(), id)
}
