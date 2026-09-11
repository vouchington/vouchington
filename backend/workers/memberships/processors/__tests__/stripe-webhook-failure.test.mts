import { describe, expect, it, vi } from 'vitest'
import {
  getStripeEventById,
  getStripeEventByStripeEventId,
  markStripeEventFailed,
  markStripeEventProcessing,
} from '@services/stripe/events'
import { handleStripeWebhookEvent } from '@services/stripe-webhook-processing'
import { createStripeEvent } from '../stripe-webhook-test-fixtures.mts'
import { processStripeWebhook } from '../stripe-webhook.mts'

describe('stripe-webhook processing failures', () => {
  it('records processing failures before retrying the job', async () => {
    const storedEvent = {
      id: 'event-record-1',
      payload: createStripeEvent('invoice.upcoming', { object: 'invoice' }),
    } as NonNullable<Awaited<ReturnType<typeof getStripeEventByStripeEventId>>>
    const markFailed = vi.fn<typeof markStripeEventFailed>().mockResolvedValue(undefined)
    const failure = new Error('handler failed')

    await expect(
      processStripeWebhook(
        {
          stripeEventRecordId: storedEvent.id,
          processingAttemptId: 'attempt-1',
          stripeSubscriptionId: null,
          livemode: false,
        },
        false,
        {
          getStripeEventById: vi.fn<typeof getStripeEventById>().mockResolvedValue(storedEvent),
          markStripeEventProcessing: vi
            .fn<typeof markStripeEventProcessing>()
            .mockResolvedValue(storedEvent),
          handleStripeWebhookEvent: vi
            .fn<typeof handleStripeWebhookEvent>()
            .mockRejectedValue(failure),
          markStripeEventFailed: markFailed,
        },
      ),
    ).rejects.toBe(failure)
    expect(markFailed).toHaveBeenCalledWith(storedEvent.id, 'handler failed', 'attempt-1', false)
  })
})
