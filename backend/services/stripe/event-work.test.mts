import { describe, expect, it } from 'vitest'
import {
  createTestStripeDeletionEvent,
  rewriteTestImmutableStripeEvent,
} from '@voucha/test-helpers/stripe-event-work'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers/entities/stripe-events'
import { removeTerminalStripeWorkForRetention } from '@voucha/test-helpers/payment-ledger-retention'
import { cleanupPaymentLedgers } from '../data-retention/cleanup-payment-ledgers.mts'
import { insertStripeEvent } from './insert-event.mts'
import {
  getStripeEventById,
  markStripeEventProcessing,
  restartFailedStripeEventAttempt,
} from './event-processing.mts'
import { markStripeEventCompleted, markStripeEventFailed } from './event-lifecycle.mts'

describe('immutable Stripe events and current worker ownership', () => {
  it('preserves exact replay and rejects inbound log mutation', async () => {
    const event = createTestStripeDeletionEvent()
    const first = await insertStripeEvent(event)
    const replay = await insertStripeEvent(event)
    expect(replay.id).toBe(first.id)
    expect(replay.is_new).toBe(false)
    await expect(rewriteTestImmutableStripeEvent(first.id)).rejects.toMatchObject({ code: '23514' })
    expect((await getStripeEventById(first.id))?.payload).toEqual(event)
  })

  it('admits one ledger row when the same fresh Stripe event arrives concurrently', async () => {
    const event = createTestStripeDeletionEvent()
    const admitted = await Promise.all(Array.from({ length: 6 }, () => insertStripeEvent(event)))
    expect(admitted.filter(row => row.is_new)).toHaveLength(1)
    expect(new Set(admitted.map(row => row.id)).size).toBe(1)
    expect(admitted.every(row => row.stripe_event_id === event.id)).toBe(true)
  })

  it('keeps exact replay until fiscal retirement and accepts the event anew afterward', async () => {
    const occurredAt = new Date(Date.UTC(new Date().getUTCFullYear() - 8, 11, 31, 12))
    const event = {
      ...createTestStripeDeletionEvent(),
      created: Math.floor(occurredAt.getTime() / 1000),
    }
    const first = await insertStripeEvent(event)
    expect(first.is_new).toBe(true)
    await expect(
      cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [first.id]),
    ).resolves.toContainEqual({
      family: 'stripe_event',
      scanned: 0,
      deleted: 0,
      hasMore: false,
    })
    await markStripeEventProcessing(first.id, first.lease_token)
    await markStripeEventCompleted(first.id, 'processed', first.lease_token)
    await removeTerminalStripeWorkForRetention(first.id)

    const replay = await insertStripeEvent(event)
    expect(replay).toMatchObject({ id: first.id, is_new: false, status: 'retained' })
    await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [first.id])
    const receivedAgain = await insertStripeEvent(event)
    expect(receivedAgain).toMatchObject({ is_new: true, status: 'received' })
    expect(receivedAgain.id).not.toBe(first.id)
  })

  it('rejects expired and superseded finalization without changing successor work', async () => {
    const inserted = await insertStripeEvent(createTestStripeDeletionEvent())
    await markStripeEventProcessing(inserted.id, inserted.lease_token)
    await makeStripeEventRecoverableForTest(inserted.id, 'stale')
    await markStripeEventCompleted(inserted.id, 'processed', inserted.lease_token)
    expect((await getStripeEventById(inserted.id))?.processed_at).toBeNull()
    await makeStripeEventRecoverableForTest(inserted.id, 'failed')
    const successor = await restartFailedStripeEventAttempt(inserted.id)
    if (!successor) throw new Error('Expected failed work to reopen')
    expect(successor).not.toBe(inserted.lease_token)
    await markStripeEventProcessing(inserted.id, successor)
    await markStripeEventCompleted(inserted.id, 'processed', inserted.lease_token)
    await markStripeEventFailed(inserted.id, 'late owner', inserted.lease_token)
    expect(await getStripeEventById(inserted.id)).toMatchObject({
      status: 'processing',
      lease_token: successor,
      attempt_count: 2,
      failed_at: null,
    })
    await markStripeEventCompleted(inserted.id, 'processed', successor)
    expect((await getStripeEventById(inserted.id))?.status).toBe('processed')
  })
})
