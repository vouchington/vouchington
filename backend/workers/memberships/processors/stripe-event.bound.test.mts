import { describe, expect, it, onTestFinished } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { getStripeEventById } from '@services/stripe/events'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { createRecoverableStripeEvent } from '@voucha/test-helpers/stripe-recovery-fixtures'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { recoverStripeEvents } from './stripe-event.mts'

describe('recoverStripeEvents', () => {
  it('enqueues one owned page and leaves an equally eligible event unchanged', async () => {
    const first = await createRecoverableStripeEvent()
    const second = await createRecoverableStripeEvent()
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)
    const ids = [first.id, second.id]

    await expect(recoverStripeEvents(ids, 1)).resolves.toEqual({ enqueued: 1, hasMore: true })
    const jobs = await readAllQueueJobs(memberships)
    expect(
      jobs
        .filter(
          job => (job.data as { stripeEventRecordId?: string }).stripeEventRecordId === first.id,
        )
        .map(job => [job.name, job.data]),
    ).toEqual([
      [
        'processStripeEvent',
        {
          stripeEventRecordId: first.id,
          leaseToken: first.lease_token,
          stripeSubscriptionId: first.subscription_id,
          isLiveMode: false,
        },
      ],
    ])
    expect(
      jobs.filter(
        job => (job.data as { stripeEventRecordId?: string }).stripeEventRecordId === neighbor.id,
      ),
    ).toEqual([])
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)

    await expect(recoverStripeEvents(ids, 1)).resolves.toEqual({ enqueued: 1, hasMore: true })
    await expect(recoverStripeEvents(ids, 1)).resolves.toEqual({ enqueued: 0, hasMore: false })
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
  })

  it('does not enqueue an empty owned recovery batch', async () => {
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)
    await expect(recoverStripeEvents([], 1)).resolves.toEqual({ enqueued: 0, hasMore: false })
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
    const jobs = await readAllQueueJobs(memberships)
    expect(
      jobs.filter(
        job => (job.data as { stripeEventRecordId?: string }).stripeEventRecordId === neighbor.id,
      ),
    ).toEqual([])
  })

  it('propagates a failed claim without touching its eligible neighbor', async () => {
    const owned = await createRecoverableStripeEvent()
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)
    const failure = new Error('recovery claim failed')
    onTestFinished(rejectPostgresWriteForTest('claimRecoverableStripeEvents', failure))
    await expect(recoverStripeEvents([owned.id], 1)).rejects.toBe(failure)
    await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
  })
  it('propagates a failed default claim before any global write runs', async () => {
    const failure = new Error('default Stripe claim failed')
    onTestFinished(rejectPostgresWriteForTest('claimRecoverableStripeEvents', failure))
    await expect(claimRecoverableStripeEvents()).rejects.toBe(failure)
    await expect(recoverStripeEvents()).rejects.toBe(failure)
  })
})
