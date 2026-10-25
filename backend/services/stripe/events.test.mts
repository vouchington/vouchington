import { beforeEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { getTestStripeEventByStripeEventId } from '@voucha/test-helpers/stripe-event-readers'
import {
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from './events.mts'
import { insertStripeEvent } from './insert-event.mts'
import { restartFailedStripeEventAttempt } from './event-processing.mts'

describe('events', () => {
  beforeEach(async () => {})
  describe('stripe event persistence', () => {
    it('inserts a new stripe event with normalized identifiers', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        object: 'checkout.session',
        customer: 'cus_test_123',
        subscription: 'sub_test_123',
        payment_status: 'paid',
      })

      const inserted = await insertStripeEvent(event)
      expect(inserted.is_new).toBe(true)
      expect(inserted.checkout_session_id).toBe('cs_test_123')
      expect(inserted.customer_id).toBe('cus_test_123')
      expect(inserted.subscription_id).toBe('sub_test_123')
      expect(inserted.status).toBe('received')
      expect(inserted.received_at).toBeInstanceOf(Date)
      expect(inserted.leased_at).toBeNull()
      expect(inserted.processed_at).toBeNull()
      expect(inserted.ignored_at).toBeNull()
      expect(inserted.failed_at).toBeNull()
      expect(inserted.payload.id).toBe(event.id)
    })

    it('deduplicates by stripe_event_id', async () => {
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_456',
        object: 'invoice',
        customer: 'cus_test_456',
        subscription: 'sub_test_456',
      })

      const first = await insertStripeEvent(event)
      const second = await insertStripeEvent(event)

      expect(first.id).toBe(second.id)
      expect(first.stripe_event_id).toBe(second.stripe_event_id)
      expect(second.is_new).toBe(false)
    })

    it('deduplicates concurrent inserts of the same stripe_event_id', async () => {
      const event = createStripeEvent(`future.Event-${Math.random().toString(36).slice(2)}`, {
        id: 'in_test_concurrent',
        object: 'invoice',
        customer: 'cus_test_concurrent',
        subscription: 'sub_test_concurrent',
      })

      const [first, second] = await Promise.all([
        insertStripeEvent(event),
        insertStripeEvent(event),
      ])

      expect(first.stripe_event_type_id).toBe(event.type)
      expect(first.id).toBe(second.id)
      expect([first.is_new, second.is_new].toSorted()).toEqual([false, true])
    })

    it('tracks processing lifecycle', async () => {
      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        object: 'subscription',
        customer: 'cus_test_789',
        status: 'active',
        items: { data: [] },
      })

      const inserted = await insertStripeEvent(event)
      const processing = await markStripeEventProcessing(inserted.id, inserted.lease_token)
      expect(processing?.status).toBe('processing')
      expect(processing?.leased_at).toBeInstanceOf(Date)
      expect(processing?.attempt_count).toBe(1)

      await markStripeEventFailed(inserted.id, 'test failure', inserted.lease_token)
      const failed = await getTestStripeEventByStripeEventId(inserted.stripe_event_id)
      expect(failed?.status).toBe('failed')
      expect(failed?.failed_at).toBeInstanceOf(Date)
      expect(failed?.last_error_message).toBe('test failure')

      const retryAttemptId = await restartFailedStripeEventAttempt(inserted.id)
      expect(retryAttemptId).not.toBe(inserted.lease_token)
      const retried = await markStripeEventProcessing(inserted.id, retryAttemptId!)
      expect(retried?.status).toBe('processing')
      expect(retried?.attempt_count).toBe(2)
      expect(retried?.failed_at).toBeNull()
      expect(retried?.last_error_at).toBeNull()
      expect(retried?.last_error_message).toBeNull()

      await markStripeEventCompleted(inserted.id, 'processed', retryAttemptId!)
      const processed = await getTestStripeEventByStripeEventId(inserted.stripe_event_id)
      expect(processed?.status).toBe('processed')
      expect(processed?.processed_at).not.toBeNull()
      expect(processed?.ignored_at).toBeNull()
      expect(processed?.failed_at).toBeNull()
    })

    it('tracks ignored events as a terminal lifecycle timestamp', async () => {
      const event = createStripeEvent('invoice.upcoming', {
        id: 'in_test_ignore',
        object: 'invoice',
        customer: 'cus_test_ignore',
        subscription: 'sub_test_ignore',
      })

      const inserted = await insertStripeEvent(event)
      await markStripeEventProcessing(inserted.id, inserted.lease_token)
      await markStripeEventCompleted(inserted.id, 'ignored', inserted.lease_token)

      const ignored = await getTestStripeEventByStripeEventId(inserted.stripe_event_id)
      expect(ignored?.status).toBe('ignored')
      expect(ignored?.ignored_at).toBeInstanceOf(Date)
      expect(ignored?.processed_at).toBeNull()
      expect(ignored?.failed_at).toBeNull()
    })

    it('does not reacquire already processed events', async () => {
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_999',
        object: 'invoice',
        customer: 'cus_test_999',
        subscription: 'sub_test_999',
      })

      const inserted = await insertStripeEvent(event)
      await markStripeEventProcessing(inserted.id, inserted.lease_token)
      await markStripeEventCompleted(inserted.id, 'processed', inserted.lease_token)
      const processing = await markStripeEventProcessing(inserted.id, inserted.lease_token)

      expect(processing).toBeNull()
    })

    it('does not mark already completed events as failed', async () => {
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_completed_failure',
        object: 'invoice',
        customer: 'cus_test_completed_failure',
        subscription: 'sub_test_completed_failure',
      })

      const inserted = await insertStripeEvent(event)
      await markStripeEventProcessing(inserted.id, inserted.lease_token)
      await markStripeEventCompleted(inserted.id, 'processed', inserted.lease_token)
      await markStripeEventFailed(inserted.id, 'late failure', inserted.lease_token)

      const completed = await getTestStripeEventByStripeEventId(inserted.stripe_event_id)
      expect(completed?.status).toBe('processed')
      expect(completed?.processed_at).toBeInstanceOf(Date)
      expect(completed?.failed_at).toBeNull()
      expect(completed?.last_error_message).toBeNull()
    })

    it('does not reacquire ignored or in-progress events', async () => {
      const ignoredEvent = createStripeEvent('invoice.upcoming', {
        id: 'in_test_already_ignored',
        object: 'invoice',
        customer: 'cus_test_already_ignored',
        subscription: 'sub_test_already_ignored',
      })
      const processingEvent = createStripeEvent('invoice.paid', {
        id: 'in_test_processing',
        object: 'invoice',
        customer: 'cus_test_processing',
        subscription: 'sub_test_processing',
      })

      const ignored = await insertStripeEvent(ignoredEvent)
      await markStripeEventProcessing(ignored.id, ignored.lease_token)
      await markStripeEventCompleted(ignored.id, 'ignored', ignored.lease_token)

      const processing = await insertStripeEvent(processingEvent)
      await markStripeEventProcessing(processing.id, processing.lease_token)

      await expect(markStripeEventProcessing(ignored.id, ignored.lease_token)).resolves.toBeNull()
      await expect(
        markStripeEventProcessing(processing.id, processing.lease_token),
      ).resolves.toBeNull()
    })
  })

  function createStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
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
})
