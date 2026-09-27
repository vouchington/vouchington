import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import {
  enqueueAllEmbeddingReconciliationRoots,
  enqueueReconcileExistingEmbeddings,
  reconciliationJobOptions,
} from './enqueues.mts'
import { bedrock_embeddings_batch } from './queues.mts'
import { BEDROCK_EMBEDDINGS_BATCH_ORDERING, PRIORITY_DEFAULT } from './config.mts'

describe('embedding reconciliation enqueues', () => {
  it('enqueues all five roots with their exact payloads through the aggregate helper', async () => {
    const enqueued = await enqueueAllEmbeddingReconciliationRoots()
    expect(enqueued).toHaveLength(5)
    const jobs = await Promise.all(
      enqueued.map(result => readEnqueuedJob(bedrock_embeddings_batch, result)),
    )
    expect(jobs.map(job => ({ name: job.name, data: job.data }))).toEqual([
      { name: 'reconcile_existing', data: { entityType: 'topics' } },
      { name: 'reconcile_existing', data: { entityType: 'posts' } },
      { name: 'reconcile_existing', data: { entityType: 'rss_feed_items' } },
      { name: 'post_trigger_recovery', data: {} },
      { name: 'rss_story_trigger_recovery', data: {} },
    ])
    for (const job of jobs) {
      expect(job.opts).toMatchObject({
        attempts: 3,
        priority: PRIORITY_DEFAULT,
        ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.reconciliation,
        removeOnComplete: 100,
        removeOnFail: 100,
      })
      expect(job.opts.deduplication).toMatchObject({ mode: 'throttle', ttl: 60_000 })
      expect(job.opts.jobId).toBeUndefined()
    }
  })

  it('keeps page continuations in the same lane without a throttle or retained job ID', async () => {
    const after = 'opaque-test-cursor'
    const enqueued = await enqueueReconcileExistingEmbeddings('topics', after)
    const job = await readEnqueuedJob(bedrock_embeddings_batch, enqueued)
    expect(job).toMatchObject({
      name: 'reconcile_existing',
      data: { entityType: 'topics', after },
      opts: {
        priority: PRIORITY_DEFAULT,
        ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.reconciliation,
        deduplication: {
          id: `bedrock-embedding-reconciliation:copy:topics:${after}`,
          mode: 'simple',
        },
      },
    })
    expect(job.opts.deduplication).not.toHaveProperty('ttl')
    expect(job.opts.jobId).toBeUndefined()
    expect(reconciliationJobOptions('copy:topics').deduplication).toEqual({
      id: 'bedrock-embedding-reconciliation:copy:topics',
      mode: 'throttle',
      ttl: 60_000,
    })
  })
})
