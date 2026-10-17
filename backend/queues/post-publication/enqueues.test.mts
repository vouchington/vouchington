import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueContinuePostPublicationShadowAudit,
  enqueueAuditReviewSuccessionHistory,
  enqueueContinueAuditReviewSuccessionHistory,
  enqueueContinuePostPublicationReconciliation,
  enqueuePostPublicationShadowAudit,
  enqueueReconcilePostPublication,
} from './enqueues.mts'
import { scheduledJobManifest } from './enqueues/schedules.mts'
import { postPublicationQueue } from './queues.mts'

const DOMAIN_GROUP = { key: 'post-publication', concurrency: 1 }

describe('post-publication enqueues', () => {
  it('describes the durable reconciliation scheduler on the background queue', () => {
    expect(scheduledJobManifest.queueName).toBe('background')
    expect(scheduledJobManifest.jobs).toEqual([
      expect.objectContaining({
        schedulerId: 'reconcile-post-publication',
        template: expect.objectContaining({ name: POST_PUBLICATION_RECONCILE_JOB.name }),
      }),
    ])
  })

  it('persists dispatcher and continuation jobs in the domain group with distinct deduplication semantics', async () => {
    const deduplicationId = `post-publication-test-${randomUUID()}`

    const [firstDispatch, secondDispatch, continuationEnqueue] = await Promise.all([
      enqueueReconcilePostPublication({ deduplicationId }),
      enqueueReconcilePostPublication({ deduplicationId }),
      enqueueContinuePostPublicationReconciliation(),
    ])

    // Throttle deduplication collapses the pair to exactly one persisted job; production glide-mq
    // returns null for the skipped add (glide-mq/dist/queue.js: "cannot wait on a
    // deduplicated/skipped/duplicate-ID add that returned null").
    const dispatched = [firstDispatch, secondDispatch].filter(
      result => !isDeduplicatedEnqueue(result),
    )
    expect(dispatched).toHaveLength(1)

    const dispatch = await readEnqueuedJob(postPublicationQueue, dispatched[0])
    expect(dispatch).toMatchObject({
      name: POST_PUBLICATION_RECONCILE_JOB.name,
      data: {},
      opts: {
        priority: 100,
        ordering: DOMAIN_GROUP,
        deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
      },
    })
    expect(dispatch.opts.jobId).toBeUndefined()

    const continuation = await readEnqueuedJob(postPublicationQueue, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: POST_PUBLICATION_RECONCILE_JOB.name,
      data: {},
      opts: { priority: 100, ordering: DOMAIN_GROUP },
    })
    expect(continuation.opts.deduplication).toBeUndefined()
  })

  it('preserves a dry-run cursor in a shadow-audit continuation of the same group', async () => {
    const cursor = '00000000-0000-7000-8000-000000000042'
    const [initialEnqueue, continuationEnqueue] = await Promise.all([
      enqueuePostPublicationShadowAudit(true),
      enqueueContinuePostPublicationShadowAudit(true, cursor),
    ])

    const initial = await readEnqueuedJob(postPublicationQueue, initialEnqueue)
    expect(initial).toMatchObject({
      name: POST_PUBLICATION_SHADOW_AUDIT_JOB.name,
      data: { dryRun: true, cursor: null },
    })

    const continuation = await readEnqueuedJob(postPublicationQueue, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: POST_PUBLICATION_SHADOW_AUDIT_JOB.name,
      data: { dryRun: true, cursor },
      opts: { priority: 100, ordering: DOMAIN_GROUP },
    })
  })

  it('preserves the fixed historical-audit cutoff in a continuation of the same group', async () => {
    const cursor = '00000000-0000-7000-8000-000000000042'
    const cutoffArchivedAt = '2026-09-09T00:00:00.000Z'
    const [initialEnqueue, continuationEnqueue] = await Promise.all([
      enqueueAuditReviewSuccessionHistory(),
      enqueueContinueAuditReviewSuccessionHistory(cursor, cutoffArchivedAt),
    ])

    const initial = await readEnqueuedJob(postPublicationQueue, initialEnqueue)
    expect(initial).toMatchObject({
      name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
      data: { cursor: null, cutoffArchivedAt: null },
      opts: { priority: 100, ordering: DOMAIN_GROUP },
    })

    const continuation = await readEnqueuedJob(postPublicationQueue, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
      data: { cursor, cutoffArchivedAt },
      opts: { priority: 100, ordering: DOMAIN_GROUP },
    })
  })
})
