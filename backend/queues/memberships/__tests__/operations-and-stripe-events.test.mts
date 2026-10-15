import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { MEMBERSHIPS_RENEWAL_CHECK_JOB } from '@queues/background/enqueues/memberships-jobs-2'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import {
  forgetDedupEntries,
  removeQueuedJobsById,
} from '../../../test-helpers/shared-queue-cleanup.mts'
import { enqueueRecoverStripeEvents, enqueueRenewalNotificationCheck } from '../enqueues.mts'
import { memberships } from '../queues.mts'

describe('membership operation and Stripe event enqueues', () => {
  it('dispatches renewal notification checks without payload state', async () => {
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['renewal-check:root'])
    const job = await readEnqueuedJob(memberships, await enqueueRenewalNotificationCheck())

    try {
      expect(job).toMatchObject({
        name: MEMBERSHIPS_RENEWAL_CHECK_JOB.name,
        data: {},
        opts: { priority: 100, attempts: 3 },
      })
    } finally {
      await job.remove()
      forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['renewal-check:root'])
    }
  })

  it('uses a throttled five-minute bucket for Stripe event recovery', async () => {
    const timeBucket = 5_666_666
    const jobId = `stripe-event-recovery__${timeBucket}`
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['stripe-event-recovery'])
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * 300_000 + 123)
    try {
      await enqueueRecoverStripeEvents()
      expect(await memberships.getJob(jobId)).toMatchObject({
        data: {},
        opts: {
          deduplication: { id: 'stripe-event-recovery', mode: 'throttle', ttl: 300_000 },
        },
      })
    } finally {
      dateNow.mockRestore()
      await removeQueuedJobsById(memberships, [jobId])
      forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['stripe-event-recovery'])
    }
  })
})
