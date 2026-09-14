import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SqsMessage } from '@backend/worker-runtime'
import { getStripeEventByStripeEventId, type ingestStripeEvent } from '@services/stripe/events'
import { memberships } from '@queues/memberships/queues'
import { processStripeEventsSqsMessage } from '../processors.mts'

type StripeEvent = Parameters<typeof ingestStripeEvent>[0]
type StripeInvoice = Extract<StripeEvent, { type: 'invoice.paid' }>['data']['object']
type StripeInvoicePayment = Extract<StripeEvent, { type: 'invoice_payment.paid' }>['data']['object']

// This file intentionally exercises real glide-mq rather than mocking it; the passthrough only
// exists because the .real-glide.mock.test.mts filename (required for backend-real-glide-mq
// project routing) trips the no-mistakes mock-file-naming rule without a vi.mock call present.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

function eventBridgeMessage(event: StripeEvent): SqsMessage {
  return {
    messageId: randomUUID(),
    receiptHandle: randomUUID(),
    // Full PutEvents envelope shape (see processors.mts) -- the real Stripe.Event only ever
    // arrives at `.detail`; a bare event body must be rejected (see the envelope tests below).
    body: JSON.stringify({
      version: '0',
      id: randomUUID(),
      'detail-type': event.type,
      source: 'aws.partner/stripe.com',
      account: '123456789012',
      time: new Date().toISOString(),
      region: 'us-west-2',
      resources: [],
      detail: event,
    }),
  }
}

function createStripeEvent(overrides: Partial<StripeEvent> = {}): StripeEvent {
  return {
    id: `evt_test_${randomUUID()}`,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `cus_test_${randomUUID()}`, object: 'customer' } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'customer.updated',
    ...overrides,
  } as unknown as StripeEvent
}

async function findStripeEventJobsFor(stripeEventRecordId: string) {
  // enqueueProcessStripeEvent sets opts.priority (PRIORITY_DEFAULT), and glide-mq's `add()`
  // enqueues any prioritized job to its scheduled ZSet rather than the plain FIFO stream --
  // getJobs() reports that ZSet as the 'delayed' state even though no opts.delay is set, so a
  // freshly enqueued job here legitimately never appears in 'waiting'.
  const [waiting, delayed] = await Promise.all([
    memberships.getJobs('waiting'),
    memberships.getJobs('delayed'),
  ])
  return [...waiting, ...delayed].filter(
    job =>
      (job.data as { stripeEventRecordId?: unknown } | null | undefined)?.stripeEventRecordId ===
      stripeEventRecordId,
  )
}

describe('processStripeEventsSqsMessage', () => {
  const createdRecordIds: string[] = []

  afterEach(async () => {
    // Remove only this test's own jobs by the record id they carry, not the whole shared
    // production queue: other parallel test runs against the same isolated real-glide-mq Valkey
    // prefix may have jobs in flight, and obliterate() would delete those too.
    const recordIds = createdRecordIds.splice(0)
    const jobs = (await Promise.all(recordIds.map(id => findStripeEventJobsFor(id)))).flat()
    await Promise.all(jobs.map(job => job.remove()))
  })

  it('unwraps the EventBridge envelope, inserts the stripe_events row, and enqueues processStripeEvent', async () => {
    const subscriptionId = `sub_test_${randomUUID()}`
    const event = createStripeEvent({
      type: 'invoice.paid',
      livemode: true,
      data: {
        object: {
          id: `in_test_${randomUUID()}`,
          object: 'invoice',
          subscription: subscriptionId,
        } as unknown as StripeInvoice,
      },
    })

    await processStripeEventsSqsMessage(eventBridgeMessage(event))

    const stored = await getStripeEventByStripeEventId(event.id)
    expect(stored).toMatchObject({ stripe_event_id: event.id, status: 'received' })
    createdRecordIds.push(stored!.id)

    const jobs = await findStripeEventJobsFor(stored!.id)
    expect(jobs).toHaveLength(1)
    const jobId = `stripe-event__${stored!.id}__${stored!.processing_attempt_id}`
    expect(jobs[0]?.id).toBe(jobId)
    expect(jobs[0]?.data).toEqual({
      stripeEventRecordId: stored!.id,
      processingAttemptId: stored!.processing_attempt_id,
      stripeSubscriptionId: subscriptionId,
      livemode: true,
    })
    expect(jobs[0]?.opts.deduplication).toEqual({ id: jobId, mode: 'simple' })
    expect(jobs[0]?.opts.ordering).toEqual({
      key: `stripe-subscription:production:${subscriptionId}`,
      concurrency: 1,
    })
  })

  it('does not assign an ordering key to an EventBridge event without a subscription', async () => {
    const event = createStripeEvent()
    await processStripeEventsSqsMessage(eventBridgeMessage(event))
    const stored = await getStripeEventByStripeEventId(event.id)
    createdRecordIds.push(stored!.id)

    const [job] = await findStripeEventJobsFor(stored!.id)
    expect(job?.data).toMatchObject({ stripeSubscriptionId: null, livemode: false })
    expect(job?.opts.ordering).toBeUndefined()
  })

  it('persists an InvoicePayment invoice and keeps the initial reconciliation job unordered', async () => {
    const invoiceId = `in_test_${randomUUID()}`
    const event = createStripeEvent({
      type: 'invoice_payment.paid',
      data: {
        object: {
          id: `ip_test_${randomUUID()}`,
          invoice: { id: invoiceId },
          object: 'invoice_payment',
        } as unknown as StripeInvoicePayment,
      },
    })

    await processStripeEventsSqsMessage(eventBridgeMessage(event))

    const stored = await getStripeEventByStripeEventId(event.id)
    expect(stored).toMatchObject({ invoice_id: invoiceId, subscription_id: null })
    createdRecordIds.push(stored!.id)
    const [job] = await findStripeEventJobsFor(stored!.id)
    expect(job?.data).toMatchObject({ stripeSubscriptionId: null })
    expect(job?.opts.ordering).toBeUndefined()
  })

  it('deduplicates redelivery of the same message so only one row and one job land', async () => {
    const event = createStripeEvent()
    const message = eventBridgeMessage(event)

    // SQS is at-least-once; simulate the same message being delivered twice.
    await processStripeEventsSqsMessage(message)
    await processStripeEventsSqsMessage(message)

    const stored = await getStripeEventByStripeEventId(event.id)
    createdRecordIds.push(stored!.id)

    const jobs = await findStripeEventJobsFor(stored!.id)
    expect(jobs).toHaveLength(1)
  })

  it('throws when the EventBridge envelope is missing detail (a bare Stripe event, not wrapped)', async () => {
    const event = createStripeEvent()
    const bareMessage: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: JSON.stringify(event),
    }

    await expect(processStripeEventsSqsMessage(bareMessage)).rejects.toThrow(
      'EventBridge envelope missing detail',
    )

    // Locks in the envelope-unwrap contract: a bare (non-enveloped) event must never be accepted
    // as `.detail` and must never reach insertStripeEvent.
    expect(await getStripeEventByStripeEventId(event.id)).toBeNull()
  })

  it('throws SyntaxError when message.body is not valid JSON, so SQS redelivery routes to the DLQ', async () => {
    const message: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: 'not json',
    }

    await expect(processStripeEventsSqsMessage(message)).rejects.toThrow(SyntaxError)
  })

  it('throws when detail is an array instead of a Stripe event object', async () => {
    const message: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: JSON.stringify({
        version: '0',
        id: randomUUID(),
        'detail-type': 'customer.updated',
        source: 'aws.partner/stripe.com',
        account: '123456789012',
        time: new Date().toISOString(),
        region: 'us-west-2',
        resources: [],
        detail: [],
      }),
    }

    await expect(processStripeEventsSqsMessage(message)).rejects.toThrow(
      'EventBridge envelope missing detail',
    )
  })

  it('throws when detail is an object but missing the id/type fields a Stripe event requires', async () => {
    const message: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: JSON.stringify({
        version: '0',
        id: randomUUID(),
        'detail-type': 'customer.updated',
        source: 'aws.partner/stripe.com',
        account: '123456789012',
        time: new Date().toISOString(),
        region: 'us-west-2',
        resources: [],
        detail: { foo: 'bar' },
      }),
    }

    await expect(processStripeEventsSqsMessage(message)).rejects.toThrow(
      'EventBridge envelope detail is not a Stripe event',
    )
  })
})
