import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueContinueStoryPostRelatedUrlProjectionReconciliation,
  enqueueReconcileStoryPostRelatedUrlProjections,
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort,
} from './enqueues.mts'
import { storyPostRelatedUrlProjections } from './queues.mts'

describe('story post related URL projection enqueues', () => {
  it('persists ordered recovery and continuation jobs with distinct deduplication', async () => {
    const deduplicationId = `projection-test-${randomUUID()}`
    const [recovery, continuation] = await Promise.all([
      enqueueReconcileStoryPostRelatedUrlProjections({ deduplicationId }),
      enqueueContinueStoryPostRelatedUrlProjectionReconciliation(),
    ])

    expect(recovery).toMatchObject({
      name: 'processReconcileStoryPostRelatedUrlProjections',
      opts: {
        priority: 100,
        ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
        deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
      },
    })
    expect(continuation).toMatchObject({
      name: 'processReconcileStoryPostRelatedUrlProjections',
      opts: {
        priority: 100,
        ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
      },
    })
  })

  it('exposes completion of the best-effort recovery enqueue', async () => {
    const deduplicationId = `projection-best-effort-test-${randomUUID()}`
    const completion = enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort({ deduplicationId })

    await completion
    const jobs = await readAllQueueJobs(storyPostRelatedUrlProjections)
    expect(jobs.filter(job => job.opts.deduplication?.id === deduplicationId)).toEqual([
      expect.objectContaining({ name: 'processReconcileStoryPostRelatedUrlProjections' }),
    ])
  })
})
