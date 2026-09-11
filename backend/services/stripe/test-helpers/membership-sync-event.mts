import type Stripe from 'stripe'

export function makeStripeSubscriptionEvent(
  id: string,
  subscriptionId: string,
  livemode = true,
): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1_741_398_400,
    data: { object: { id: subscriptionId, object: 'subscription' } },
    livemode,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  } as Stripe.Event
}
