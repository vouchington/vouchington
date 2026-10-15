import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  POST_PUBLICATION_JOBS,
  POST_PUBLICATION_RECONCILE_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import { background } from '@queues/background/queues'
import type { BackgroundHandler } from '@queues/background/types'
import { enqueueReconcilePostPublication } from '@queues/post-publication/enqueues'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

// A no-op handler, never the real post-publication handlers: those reconcile every dirty work row
// in the shared database and re-enqueue continuations. Serving only this domain parks the others.
const worker = createBackgroundWorker({
  handlers: [
    ...BACKGROUND_HANDLERS.filter(handler => handler.job.domain !== 'post-publication'),
    ...POST_PUBLICATION_JOBS.map((job): BackgroundHandler => ({ job, handle: async () => {} })),
  ],
  domains: ['post-publication'],
})

describe('post-publication background domain', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('registers a handler for every post-publication job of the real handler list', () => {
    const handled = BACKGROUND_HANDLERS.filter(handler => handler.job.domain === 'post-publication')
    expect(handled.map(handler => handler.job.name).toSorted()).toEqual([
      'post-publication.audit-review-succession-history',
      'post-publication.reconcile',
      'post-publication.shadow-audit',
    ])
  })

  it('resolves persisted job semantics after a live consumer drains the job', async () => {
    const deduplicationId = `post-publication-live-${crypto.randomUUID()}`
    const dispatch = await readEnqueuedJob(
      background,
      await enqueueReconcilePostPublication({ deduplicationId }),
    )

    // `addAndFlush` blocks until the stub worker drains the job, so by the time the enqueue resolves
    // the job has left `waiting` for a terminal state (#11013): a `getJobs('waiting')` scan would see
    // nothing, so assert the job reached `completed` and the id-scoped read still resolves it.
    const [waiting, completed] = await Promise.all([
      background.getJobs('waiting'),
      background.getJobs('completed'),
    ])
    expect(waiting.map(job => job.id)).not.toContain(dispatch.id)
    expect(completed.map(job => job.id)).toContain(dispatch.id)
    expect(dispatch).toMatchObject({
      name: POST_PUBLICATION_RECONCILE_JOB.name,
      data: {},
      opts: {
        priority: 100,
        ordering: { key: 'post-publication', concurrency: 1 },
        deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 },
      },
    })
  })
})
