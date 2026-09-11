import { beforeEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import {
  getStripeEventByStripeEventId,
  insertStripeEvent,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
  restartFailedStripeEventAttempt,
} from './events.mts'
import { normalizeStripeEvent } from './normalize-event.mts'

describe('events', () => {
  beforeEach(async () => {})
  describe('normalizeStripeEvent', () => {
    it('extracts normalized ids from invoice events', () => {
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_123',
        object: 'invoice',
        customer: 'cus_test_123',
        subscription: 'sub_test_123',
      })

      expect(normalizeStripeEvent(event)).toEqual({
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: 'cus_test_123',
        subscriptionId: 'sub_test_123',
        invoiceId: 'in_test_123',
        checkoutSessionId: null,
      })
    })

    it('extracts normalized ids from subscription events', () => {
      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_abc',
        object: 'subscription',
        customer: 'cus_test_abc',
        status: 'active',
        items: { data: [] },
      })

      expect(normalizeStripeEvent(event)).toEqual({
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: 'cus_test_abc',
        subscriptionId: 'sub_test_abc',
        invoiceId: null,
        checkoutSessionId: null,
      })
    })

    it('extracts normalized ids from checkout session events', () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_abc',
        object: 'checkout.session',
        customer: 'cus_test_abc',
        subscription: 'sub_test_abc',
        payment_status: 'paid',
      })

      expect(normalizeStripeEvent(event)).toEqual({
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: 'cus_test_abc',
        subscriptionId: 'sub_test_abc',
        invoiceId: null,
        checkoutSessionId: 'cs_test_abc',
      })
    })

    it('extracts normalized ids from customer events', () => {
      const event = createStripeEvent('customer.updated', {
        id: 'cus_test_xyz',
        object: 'customer',
      })

      expect(normalizeStripeEvent(event)).toEqual({
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: 'cus_test_xyz',
        subscriptionId: null,
        invoiceId: null,
        checkoutSessionId: null,
      })
    })

    it('returns nulls when ids are missing', () => {
      const event = createStripeEvent('payment_intent.created', {
        id: 'pi_test_123',
        object: 'payment_intent',
      })

      expect(normalizeStripeEvent(event)).toEqual({
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: null,
        subscriptionId: null,
        invoiceId: null,
        checkoutSessionId: null,
      })
    })
  })

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
      expect(inserted.processing_started_at).toBeNull()
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
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_concurrent',
        object: 'invoice',
        customer: 'cus_test_concurrent',
        subscription: 'sub_test_concurrent',
      })

      const [first, second] = await Promise.all([
        insertStripeEvent(event),
        insertStripeEvent(event),
      ])

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
      const processing = await markStripeEventProcessing(inserted.stripe_event_id)
      expect(processing?.status).toBe('processing')
      expect(processing?.processing_started_at).toBeInstanceOf(Date)
      expect(processing?.processing_attempts).toBe(1)

      await markStripeEventFailed(inserted.stripe_event_id, 'test failure')
      const failed = await getStripeEventByStripeEventId(inserted.stripe_event_id)
      expect(failed?.status).toBe('failed')
      expect(failed?.failed_at).toBeInstanceOf(Date)
      expect(failed?.last_error_message).toBe('test failure')

      const retryAttemptId = await restartFailedStripeEventAttempt(inserted.id)
      expect(retryAttemptId).not.toBe(inserted.processing_attempt_id)
      const retried = await markStripeEventProcessing(inserted.id, retryAttemptId!)
      expect(retried?.status).toBe('processing')
      expect(retried?.processing_attempts).toBe(2)
      expect(retried?.failed_at).toBeNull()
      expect(retried?.last_error_at).toBeNull()
      expect(retried?.last_error_message).toBeNull()

      await markStripeEventCompleted(inserted.stripe_event_id, 'processed')
      const processed = await getStripeEventByStripeEventId(inserted.stripe_event_id)
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
      await markStripeEventProcessing(inserted.stripe_event_id)
      await markStripeEventCompleted(inserted.stripe_event_id, 'ignored')

      const ignored = await getStripeEventByStripeEventId(inserted.stripe_event_id)
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
      await markStripeEventCompleted(inserted.stripe_event_id, 'processed')
      const processing = await markStripeEventProcessing(inserted.stripe_event_id)

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
      await markStripeEventCompleted(inserted.stripe_event_id, 'processed')
      await markStripeEventFailed(inserted.stripe_event_id, 'late failure')

      const completed = await getStripeEventByStripeEventId(inserted.stripe_event_id)
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
      await markStripeEventCompleted(ignored.stripe_event_id, 'ignored')

      const processing = await insertStripeEvent(processingEvent)
      await markStripeEventProcessing(processing.stripe_event_id)

      await expect(markStripeEventProcessing(ignored.stripe_event_id)).resolves.toBeNull()
      await expect(markStripeEventProcessing(processing.stripe_event_id)).resolves.toBeNull()
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
