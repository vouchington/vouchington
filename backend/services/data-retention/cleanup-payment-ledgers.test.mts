import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attemptYoungStripeLedgerDeletion,
  createTestStripeDeletionEvent,
  deleteTestStripeEventWithoutRetention,
  expireTerminalStripeWorkBeforeLedger,
  markTestStripeEventIgnored,
  stripeEventIdentityState,
} from '@voucha/test-helpers/stripe-event-work'
import { insertStripeEvent } from '../stripe/insert-event.mts'
import { processStripeEventsSqsMessage } from '../../workers/stripe-events-sqs/processors.mts'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'

describe('payment ledger retention', () => {
  it('expires terminal events seven years after their UTC fiscal year and preserves exact replay', async () => {
    const oldEvent = { ...createTestStripeDeletionEvent(), created: Date.UTC(2018, 11, 31) / 1000 }
    const recentEvent = { ...createTestStripeDeletionEvent(), created: Date.UTC(2019, 0, 1) / 1000 }
    const old = await insertStripeEvent(oldEvent)
    const recent = await insertStripeEvent(recentEvent)
    await markTestStripeEventIgnored(old.id)
    await markTestStripeEventIgnored(recent.id)

    await expect(deleteTestStripeEventWithoutRetention(old.id)).rejects.toThrow(
      /Stripe event is within billing retention or unfinished/,
    )
    expect(await stripeEventIdentityState(oldEvent.id)).toEqual({ live: true, retained: true })
    await expireTerminalStripeWorkBeforeLedger(old.id)
    await expect(attemptYoungStripeLedgerDeletion(recent.id)).rejects.toThrow(
      /Stripe event is within billing retention or unfinished/,
    )

    const result = await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, [old.id, recent.id])
    expect(result).toContainEqual({
      family: 'stripe_event',
      scanned: 2,
      deleted: 1,
      hasMore: false,
    })
    expect(await stripeEventIdentityState(oldEvent.id)).toEqual({ live: false, retained: true })
    expect(await stripeEventIdentityState(recentEvent.id)).toEqual({ live: true, retained: true })
    await expect(insertStripeEvent(oldEvent)).rejects.toThrow(
      /terminal Stripe event identity is retained/,
    )

    await expect(
      processStripeEventsSqsMessage({
        messageId: randomUUID(),
        receiptHandle: randomUUID(),
        body: JSON.stringify({ detail: oldEvent }),
      }),
    ).resolves.toBeUndefined()
    expect(await stripeEventIdentityState(oldEvent.id)).toEqual({ live: false, retained: true })
  })
})
