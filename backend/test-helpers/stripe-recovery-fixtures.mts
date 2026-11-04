import { randomUUID } from 'node:crypto'
import { insertStripeEvent } from '../services/stripe/insert-event.mts'
import type Stripe from 'stripe'
import { makeStripeEventRecoverableForTest } from './entities/stripe-events.mts'

/** Durable ignored-provider work, without an initial queue admission. */
export async function createRecoverableStripeEvent(
  mode: 'unstarted' | 'stale' | 'failed' = 'unstarted',
) {
  const stored = await insertStripeEvent(
    createStripeRecoveryEvent({ subscriptionId: `sub_${randomUUID()}` }),
  )
  await makeStripeEventRecoverableForTest(stored.id, mode)
  return stored
}

/** Ignored Stripe event wire fixture shared by recovery service and worker tests. */
export function createStripeRecoveryEvent({
  subscriptionId = null,
  livemode = false,
}: { subscriptionId?: string | null; livemode?: boolean } = {}): Stripe.Event {
  const suffix = randomUUID()
  return {
    id: `evt_recovery_${suffix}`,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `in_${suffix}`, object: 'invoice', subscription: subscriptionId } },
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'invoice.upcoming',
  } as unknown as Stripe.Event
}
