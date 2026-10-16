import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB } from '@queues/background/enqueues/memberships-jobs-2'
import { MEMBERSHIPS_STRIPE_EVENT_JOB } from '@queues/background/enqueues/memberships-jobs'
import {
  backdateTestMembershipPauseCollectionAvailableAt,
  createTestUser,
  deleteTestMembershipPauseCollectionWork,
  readTestPauseCollectionSyncJobs,
  recordTestMembershipPauseCollectionWork,
} from '@voucha/test-helpers'
import { PROCESSORS } from './job-processors.mts'
import { createMembershipsHandlers } from './process-job.mts'
import type { processStripeEvent } from './stripe-event.mts'

function handlerFor(name: string, processors = PROCESSORS) {
  const handler = createMembershipsHandlers(processors).find(
    candidate => candidate.job.name === name,
  )
  if (!handler) throw new Error(`Unknown job name: ${name}`)
  return handler
}

describe('memberships job handlers with default processors', () => {
  it('treats a stripe job without an attempt limit as its final attempt', async () => {
    const stripe = vi.fn<typeof processStripeEvent>()
    const queued = { data: { leaseToken: 'attempt-1' }, attemptsMade: 0, opts: {} } as Job
    await handlerFor(MEMBERSHIPS_STRIPE_EVENT_JOB.name, {
      ...PROCESSORS,
      processStripeEvent: stripe,
    }).handle(queued)
    expect(stripe).toHaveBeenCalledWith(queued.data, true)
  })

  it('enqueues a sync for each due pause-collection lease', async () => {
    const member = await createTestUser()
    await recordTestMembershipPauseCollectionWork(member.id)
    await backdateTestMembershipPauseCollectionAvailableAt(member.id)
    try {
      await handlerFor(MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB.name).handle({ data: {} } as Job)

      expect(await readTestPauseCollectionSyncJobs(member.id)).toHaveLength(1)
    } finally {
      await deleteTestMembershipPauseCollectionWork(member.id)
    }
  })
})
