import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  enqueueBackfillFollowerDistributions,
  enqueueBulkProcessFollowerDistributions,
  enqueueProcessFollowerDistribution,
} from './enqueues.mts'
import { followerDistributions } from './queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('follower distribution enqueue helpers', () => {
  it('enqueues a single process job with the distribution id and debounce dedup', async () => {
    const distributionId = `distribution-${randomUUID()}`

    await enqueueProcessFollowerDistribution(distributionId)

    const allJobs = await readAllQueueJobs(followerDistributions)
    const jobs = allJobs.filter(
      j => (j.data as { distributionId?: string }).distributionId === distributionId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0].opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 1000, type: 'exponential' },
      priority: 10,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        id: `process_follower_distribution__${distributionId}`,
        mode: 'debounce',
      },
    })
  })

  it('deduplicates bulk process jobs before building job payloads', async () => {
    const distributionId = `distribution-${randomUUID()}`

    await enqueueBulkProcessFollowerDistributions([distributionId, distributionId])

    const allJobs = await readAllQueueJobs(followerDistributions)
    const jobs = allJobs.filter(
      j => (j.data as { distributionId?: string }).distributionId === distributionId,
    )
    // The duplicate input id is collapsed to a single job before payloads are built.
    expect(jobs).toHaveLength(1)
    expect(jobs[0].opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `process_follower_distribution__${distributionId}`,
        mode: 'debounce',
      },
    })
  })

  it('enqueues the singleton backfill job with throttle deduplication', async () => {
    await enqueueBackfillFollowerDistributions()

    const allJobs = await readAllQueueJobs(followerDistributions)
    const job = allJobs.find(
      j =>
        (j.opts as { deduplication?: { id?: string } }).deduplication?.id ===
        'backfill_follower_distributions',
    )
    expect(job).toBeDefined()
    expect(job!.data).toEqual({})
    expect(job!.opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      priority: 100,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: { id: 'backfill_follower_distributions', mode: 'throttle' },
    })
  })
})
