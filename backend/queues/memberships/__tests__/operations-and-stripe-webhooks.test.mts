import { describe, expect, it, vi } from 'vitest'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import { enqueueRecoverStripeWebhooks, enqueueRenewalNotificationCheck } from '../enqueues.mts'
import { memberships } from '../queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('membership operation and Stripe webhook enqueues', () => {
  it('dispatches renewal notification checks without payload state', async () => {
    const job = await readEnqueuedJob(memberships, await enqueueRenewalNotificationCheck())

    expect(job).toMatchObject({
      name: 'processRenewalNotificationCheck',
      data: {},
      opts: { priority: 100 },
    })
  })

  it('uses a throttled five-minute bucket for Stripe webhook recovery', async () => {
    await memberships.obliterate({ force: true })
    const timeBucket = 5_666_666
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * 300_000 + 123)
    try {
      await enqueueRecoverStripeWebhooks()
      const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
      expect(jobs.find(job => job.id === `stripe-webhook-recovery__${timeBucket}`)).toMatchObject({
        data: {},
        opts: {
          deduplication: {
            id: 'stripe-webhook-recovery',
            mode: 'throttle',
            ttl: 300_000,
          },
        },
      })
    } finally {
      dateNow.mockRestore()
      await memberships.obliterate({ force: true })
    }
  })
})
