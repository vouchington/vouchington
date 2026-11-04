import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers'
import {
  createRecoverableStripeEvent,
  createStripeRecoveryEvent,
} from '@voucha/test-helpers/stripe-recovery-fixtures'
import {
  getStripeEventById,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from './events.mts'
import { insertStripeEvent } from './insert-event.mts'
import { claimRecoverableStripeEvents } from './recovery.mts'

describe('Stripe event recovery', () => {
  it('reuses unstarted attempt tokens and rotates failed or stale attempts', async () => {
    const event = await insertStripeEvent(
      createStripeRecoveryEvent({ subscriptionId: `sub_${randomUUID()}` }),
    )
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)
    await makeStripeEventRecoverableForTest(event.id, 'unstarted')
    const unstarted = (await claimRecoverableStripeEvents([event.id], 2)).find(
      candidate => candidate.stripeEventRecordId === event.id,
    )
    expect(unstarted?.leaseToken).toBe(event.lease_token)

    await makeStripeEventRecoverableForTest(event.id, 'stale')
    const stale = (await claimRecoverableStripeEvents([event.id], 2)).find(
      candidate => candidate.stripeEventRecordId === event.id,
    )
    expect(stale?.leaseToken).not.toBe(event.lease_token)
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
  })

  it('claims only the requested due events', async () => {
    const owned = await insertStripeEvent(createStripeRecoveryEvent())
    const other = await insertStripeEvent(createStripeRecoveryEvent())
    await makeStripeEventRecoverableForTest(owned.id, 'unstarted')
    await makeStripeEventRecoverableForTest(other.id, 'unstarted')
    const before = await getStripeEventById(other.id)

    expect(
      (await claimRecoverableStripeEvents([owned.id])).map(e => e.stripeEventRecordId),
    ).toEqual([owned.id])
    await expect(getStripeEventById(other.id)).resolves.toEqual(before)
    // The bystander was left due, so a second scoped claim still takes it.
    expect(
      (await claimRecoverableStripeEvents([other.id])).map(e => e.stripeEventRecordId),
    ).toEqual([other.id])
  })

  it('returns the durable subscription identity needed to serialize recovery jobs', async () => {
    const subscriptionId = `sub_${randomUUID()}`
    const event = await insertStripeEvent(
      createStripeRecoveryEvent({ subscriptionId, livemode: true }),
    )
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)
    await makeStripeEventRecoverableForTest(event.id, 'unstarted')

    expect(
      (await claimRecoverableStripeEvents([event.id], 2)).find(
        candidate => candidate.stripeEventRecordId === event.id,
      ),
    ).toMatchObject({ stripeSubscriptionId: subscriptionId, isLiveMode: true })
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
  })

  it('fences lifecycle writes by the persisted processing attempt id', async () => {
    const event = await insertStripeEvent(createStripeRecoveryEvent())
    const acquired = await markStripeEventProcessing(event.id, event.lease_token)
    expect(acquired).not.toBeNull()
    await markStripeEventCompleted(event.id, 'processed', event.id)
    await markStripeEventFailed(event.id, 'stale failure', event.id, true)
    expect((await getStripeEventById(event.id))?.status).toBe('processing')
    await markStripeEventCompleted(event.id, 'processed', event.lease_token)
    expect((await getStripeEventById(event.id))?.status).toBe('processed')
  })
})
