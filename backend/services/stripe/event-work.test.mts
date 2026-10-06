import { describe, expect, it } from 'vitest'
import {
  createTestStripeDeletionEvent,
  rewriteTestImmutableStripeEvent,
} from '@voucha/test-helpers/stripe-event-work'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers/entities/stripe-events'
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
