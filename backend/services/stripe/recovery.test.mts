import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers'
import {
  getStripeEventById,
  insertStripeEvent,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from './events.mts'
import { claimRecoverableStripeEvents } from './recovery.mts'

describe('Stripe webhook recovery', () => {
  it('reuses unstarted attempt tokens and rotates failed or stale attempts', async () => {
    const event = await insertStripeEvent(makeEvent({ subscriptionId: `sub_${randomUUID()}` }))
    await makeStripeEventRecoverableForTest(event.id, 'unstarted')
    const unstarted = (await claimRecoverableStripeEvents()).find(
      candidate => candidate.stripeEventRecordId === event.id,
    )
    expect(unstarted?.processingAttemptId).toBe(event.processing_attempt_id)

    await makeStripeEventRecoverableForTest(event.id, 'stale')
    const stale = (await claimRecoverableStripeEvents()).find(
      candidate => candidate.stripeEventRecordId === event.id,
    )
    expect(stale?.processingAttemptId).not.toBe(event.processing_attempt_id)
  })

  it('returns the durable subscription identity needed to serialize recovery jobs', async () => {
    const subscriptionId = `sub_${randomUUID()}`
    const event = await insertStripeEvent(makeEvent({ subscriptionId, livemode: true }))
    await makeStripeEventRecoverableForTest(event.id, 'unstarted')

    expect(
      (await claimRecoverableStripeEvents()).find(
        candidate => candidate.stripeEventRecordId === event.id,
      ),
    ).toMatchObject({ stripeSubscriptionId: subscriptionId, livemode: true })
  })

  it('fences lifecycle writes by the persisted processing attempt id', async () => {
    const event = await insertStripeEvent(makeEvent())
    const acquired = await markStripeEventProcessing(event.id, event.processing_attempt_id)
    expect(acquired).not.toBeNull()
    await markStripeEventCompleted(event.id, 'processed', event.id)
    await markStripeEventFailed(event.id, 'stale failure', event.id, true)
    expect((await getStripeEventById(event.id))?.status).toBe('processing')
    await markStripeEventCompleted(event.id, 'processed', event.processing_attempt_id)
    expect((await getStripeEventById(event.id))?.status).toBe('processed')
  })

  function makeEvent({
    subscriptionId = null,
    livemode = false,
  }: { subscriptionId?: string | null; livemode?: boolean } = {}): Stripe.Event {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`
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
})
