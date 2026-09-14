import type Stripe from 'stripe'
import type { getStripeSubscription } from '@modules/stripe/subscriptions'

type TestStripeSubscription = Awaited<ReturnType<typeof getStripeSubscription>>

export function createUniqueStripePriceId(label: string): string {
  return `price_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createUniqueStripeId(prefix: string, label: string): string {
  return `${prefix}_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1_741_398_400,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as Stripe.Event
}

export function createTestStripeSubscription({
  id,
  status,
  stripePriceId,
}: {
  id: string
  status: Stripe.Subscription.Status
  stripePriceId: string
}): TestStripeSubscription {
  return {
    id,
    object: 'subscription',
    status,
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 60 * 60,
    items: { data: [{ price: { id: stripePriceId } }] },
  } as unknown as TestStripeSubscription
}

export function toJobData(storedEvent: {
  id: string
  processing_attempt_id: string
  subscription_id: string | null
  livemode: boolean
}) {
  return {
    stripeEventRecordId: storedEvent.id,
    processingAttemptId: storedEvent.processing_attempt_id,
    stripeSubscriptionId: storedEvent.subscription_id,
    livemode: storedEvent.livemode,
  }
}
