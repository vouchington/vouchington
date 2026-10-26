import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  POST_PUBLICATION_EFFECTS_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import { hashCapturedPublicationKeys } from '../../services/post-publication/captured-keys.mts'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import {
  enqueueAuditReviewSuccessionHistory,
  enqueueContinueAuditReviewSuccessionHistory,
  enqueuePostPublicationEffects,
  postPublicationEffectJobId,
} from './enqueues.mts'
import { postPublicationQueue } from './queues.mts'

describe('post-publication direct enqueues', () => {
  it('uses a stable per-change ID, sensitive retention, and the bounded effects lane', async () => {
    const postId = randomUUID()
    const data: PostPublicationEffectsJobData = {
      changeId: randomUUID(),
      postId,
      scope: { type: 'post', id: postId },
      reason: 'post_updated',
      keys: [{ kind: 'impact_post', uuidValue: postId }],
      keyHash: hashCapturedPublicationKeys([{ kind: 'impact_post', uuidValue: postId }]),
      chunkIndex: 0,
    }
    const id = postPublicationEffectJobId(data)
    onTestFinished(async () => (await postPublicationQueue.getJob(id))?.remove())
    const job = await readEnqueuedJob(
      postPublicationQueue,
      await enqueuePostPublicationEffects(data),
    )
    expect(job).toMatchObject({
      name: POST_PUBLICATION_EFFECTS_JOB.name,
      data,
      opts: {
        jobId: id,
        ordering: { key: 'post-publication:effects', concurrency: 5 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
    await expect(enqueuePostPublicationEffects(data)).resolves.toBeNull()
  })

  it('retains the independent review-history audit cursor in its continuation', async () => {
    const cursor = randomUUID()
    const cutoffArchivedAt = '2026-09-09T00:00:00.000Z'
    const [initial, continuation] = await Promise.all([
      enqueueAuditReviewSuccessionHistory(),
      enqueueContinueAuditReviewSuccessionHistory(cursor, cutoffArchivedAt),
    ])
    const initialJob = await readEnqueuedJob(postPublicationQueue, initial)
    const continuationJob = await readEnqueuedJob(postPublicationQueue, continuation)
    onTestFinished(async () => {
      await Promise.all([initialJob, continuationJob].map(job => job.remove()))
    })
    expect(initialJob).toMatchObject({
      name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
      data: { cursor: null, cutoffArchivedAt: null },
    })
    expect(continuationJob).toMatchObject({
      name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
      data: { cursor, cutoffArchivedAt },
    })
  })
})
