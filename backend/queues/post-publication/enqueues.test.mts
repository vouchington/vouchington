import { randomUUID } from 'node:crypto'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { describe, expect, it } from 'vitest'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import { QUEUE_NAME } from './config.mts'
import {
  enqueueContinuePostPublicationShadowAudit,
  enqueueAuditReviewSuccessionHistory,
  enqueueContinueAuditReviewSuccessionHistory,
  enqueueContinuePostPublicationReconciliation,
  enqueuePostPublicationShadowAudit,
  enqueueReconcilePostPublication,
} from './enqueues.mts'
import { upsertSchedules } from './enqueues/schedules.mts'
import { postPublication } from './queues.mts'

describe('post-publication enqueues', () => {
  it('registers the durable reconciliation scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('persists ordered dispatcher and continuation jobs with distinct deduplication semantics', async () => {
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

    const dispatch = await readEnqueuedJob(postPublication, dispatched[0])
    expect(dispatch).toMatchObject({
      name: 'processReconcilePostPublication',
      data: {},
      opts: {
        priority: 100,
        ordering: { key: 'publication-reconciliation', concurrency: 1 },
        deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
      },
    })
    expect(dispatch.opts.jobId).toBeUndefined()

    const continuation = await readEnqueuedJob(postPublication, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: 'processReconcilePostPublication',
      data: {},
      opts: { priority: 100, ordering: { key: 'publication-reconciliation', concurrency: 1 } },
    })
    expect(continuation.opts.deduplication).toBeUndefined()
  })

  it('preserves a dry-run cursor in an ordered shadow-audit continuation', async () => {
    const cursor = '00000000-0000-7000-8000-000000000042'
    const [initialEnqueue, continuationEnqueue] = await Promise.all([
      enqueuePostPublicationShadowAudit(true),
      enqueueContinuePostPublicationShadowAudit(true, cursor),
    ])

    const initial = await readEnqueuedJob(postPublication, initialEnqueue)
    expect(initial).toMatchObject({
      name: 'processShadowAuditPostPublication',
      data: { dryRun: true, cursor: null },
    })

    const continuation = await readEnqueuedJob(postPublication, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: 'processShadowAuditPostPublication',
      data: { dryRun: true, cursor },
      opts: { priority: 100, ordering: { key: 'publication-reconciliation', concurrency: 1 } },
    })
  })

  it('preserves the fixed historical-audit cutoff in an ordered continuation', async () => {
    const cursor = '00000000-0000-7000-8000-000000000042'
    const cutoffArchivedAt = '2026-09-09T00:00:00.000Z'
    const [initialEnqueue, continuationEnqueue] = await Promise.all([
      enqueueAuditReviewSuccessionHistory(),
      enqueueContinueAuditReviewSuccessionHistory(cursor, cutoffArchivedAt),
    ])

    const initial = await readEnqueuedJob(postPublication, initialEnqueue)
    expect(initial).toMatchObject({
      name: 'processAuditReviewSuccessionHistory',
      data: { cursor: null, cutoffArchivedAt: null },
      opts: { priority: 100, ordering: { key: 'publication-reconciliation', concurrency: 1 } },
    })

    const continuation = await readEnqueuedJob(postPublication, continuationEnqueue)
    expect(continuation).toMatchObject({
      name: 'processAuditReviewSuccessionHistory',
      data: { cursor, cutoffArchivedAt },
      opts: { priority: 100, ordering: { key: 'publication-reconciliation', concurrency: 1 } },
    })
  })

  it('resolves persisted job semantics after a live consumer drains the job', async () => {
    // A no-op processor, never the real post-publication worker: its processors run reconciliation
    // and re-enqueue continuations, and an unexpected `failed` state makes the enqueue call itself
    // throw (the in-memory shim blocks `add()` on a queue with an attached worker until the job
    // reaches a terminal state).
    const worker = createWorker(QUEUE_NAME, async () => {})
    try {
      const deduplicationId = `post-publication-live-${randomUUID()}`
      const dispatch = await readEnqueuedJob(
        postPublication,
        await enqueueReconcilePostPublication({ deduplicationId }),
      )

      // Permanent, in-tree proof of the drained-state condition #11013 describes: `addAndFlush`
      // blocks until the stub worker drains the job, so by the time `enqueueReconcilePostPublication`
      // resolves the job has already left `waiting` for a terminal state. A `getJobs('waiting')` scan
      // (the old assertion style) would see nothing here — not because of a race, but because the
      // job is deterministically gone. Assert both halves: the job actually reached `completed` (so
      // this isn't vacuously true of a broken read), and the id-scoped read still resolves it.
      const [waiting, completed] = await Promise.all([
        postPublication.getJobs('waiting'),
        postPublication.getJobs('completed'),
      ])
      expect(waiting.map(job => job.id)).not.toContain(dispatch.id)
      expect(completed.map(job => job.id)).toContain(dispatch.id)

      // The id-scoped assertion holds independent of either of the above.
      expect(dispatch).toMatchObject({
        name: 'processReconcilePostPublication',
        data: {},
        opts: {
          priority: 100,
          ordering: { key: 'publication-reconciliation', concurrency: 1 },
          deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
        },
      })
    } finally {
      await closeAndUnregisterGlideMQInstance(worker)
    }
  })
})
