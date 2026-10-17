import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import { readAllQueueJobs } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueContinueStoryPostRelatedUrlProjectionReconciliation,
  enqueueReconcileStoryPostRelatedUrlProjections,
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort,
} from './enqueues.mts'
import { storyPostRelatedUrlProjectionsQueue } from './queues.mts'

describe('story post related URL projection enqueues', () => {
  it('persists recovery and continuation jobs under the domain-wide group with distinct deduplication', async () => {
    const deduplicationId = `projection-test-${randomUUID()}`
    const [recovery, continuation] = await Promise.all([
      enqueueReconcileStoryPostRelatedUrlProjections({ deduplicationId }),
      enqueueContinueStoryPostRelatedUrlProjectionReconciliation(),
    ])

    expect(recovery).toMatchObject({
      name: STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      opts: {
        priority: 100,
        ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
        deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
      },
    })
    expect(continuation).toMatchObject({
      name: 'story-post-related-url-projections.reconcile',
      opts: {
        priority: 100,
        ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
      },
    })
    expect(continuation).not.toHaveProperty('opts.deduplication')
  })

  it('exposes completion of the best-effort recovery enqueue', async () => {
    const deduplicationId = `projection-best-effort-test-${randomUUID()}`
    const completion = enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort({ deduplicationId })

    await completion
    const jobs = await readAllQueueJobs(storyPostRelatedUrlProjectionsQueue)
    expect(jobs.filter(job => job.opts.deduplication?.id === deduplicationId)).toEqual([
      expect.objectContaining({ name: STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name }),
    ])
  })
})
