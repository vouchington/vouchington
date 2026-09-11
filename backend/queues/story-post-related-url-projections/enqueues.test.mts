import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueContinueStoryPostRelatedUrlProjectionReconciliation,
  enqueueReconcileStoryPostRelatedUrlProjections,
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort,
} from './enqueues.mts'
import { storyPostRelatedUrlProjections } from './queues.mts'

describe('story post related URL projection enqueues', () => {
  beforeEach(async () => {
    await storyPostRelatedUrlProjections.obliterate({ force: true })
  })

  it('persists ordered recovery and continuation jobs with distinct deduplication', async () => {
    const [recovery, continuation] = await Promise.all([
      enqueueReconcileStoryPostRelatedUrlProjections({ deduplicationId: 'projection-test' }),
      enqueueContinueStoryPostRelatedUrlProjectionReconciliation(),
    ])

    expect(recovery).toMatchObject({
      name: 'processReconcileStoryPostRelatedUrlProjections',
      opts: {
        priority: 100,
        ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
        deduplication: { id: 'projection-test', mode: 'throttle', ttl: 60_000 },
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

  it('fires the recovery enqueue without requiring a caller await', async () => {
    enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort()

    await expect
      .poll(async () => readAllQueueJobs(storyPostRelatedUrlProjections), { timeout: 5_000 })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'processReconcileStoryPostRelatedUrlProjections' }),
        ]),
      )
  })
})
