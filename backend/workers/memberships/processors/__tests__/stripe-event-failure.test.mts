import { describe, expect, it, vi } from 'vitest'
import {
  getStripeEventById,
  getStripeEventByStripeEventId,
  markStripeEventFailed,
  markStripeEventProcessing,
} from '@services/stripe/events'
import { handleStripeEvent } from '@services/stripe-event-processing'
import { createStripeEvent } from '../stripe-event-test-fixtures.mts'
import { processStripeEvent } from '../stripe-event.mts'

describe('stripe-event processing failures', () => {
  it('records processing failures before retrying the job', async () => {
    const storedEvent = {
      id: 'event-record-1',
      payload: createStripeEvent('invoice.upcoming', { object: 'invoice' }),
    } as NonNullable<Awaited<ReturnType<typeof getStripeEventByStripeEventId>>>
    const markFailed = vi.fn<typeof markStripeEventFailed>().mockResolvedValue(undefined)
    const failure = new Error('handler failed')

    await expect(
      processStripeEvent(
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
          handleStripeEvent: vi.fn<typeof handleStripeEvent>().mockRejectedValue(failure),
          markStripeEventFailed: markFailed,
        },
      ),
    ).rejects.toBe(failure)
    expect(markFailed).toHaveBeenCalledWith(storedEvent.id, 'handler failed', 'attempt-1', false)
  })
})
