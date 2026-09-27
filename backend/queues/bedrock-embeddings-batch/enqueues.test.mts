import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { enqueueReconcileExistingEmbeddings, reconciliationJobOptions } from './enqueues.mts'
import { bedrock_embeddings_batch } from './queues.mts'
import { BEDROCK_EMBEDDINGS_BATCH_ORDERING, PRIORITY_DEFAULT } from './config.mts'

describe('embedding reconciliation enqueues', () => {
  it('uses distinct 60-second throttles for all five roots without retained job IDs', () => {
    const flows = [
      'copy:topics',
      'copy:posts',
      'copy:rss_feed_items',
      'post-trigger',
      'rss-story-trigger',
    ] as const
    for (const flow of flows) {
      const options = reconciliationJobOptions(flow)
      expect(options).toMatchObject({
        attempts: 3,
        priority: PRIORITY_DEFAULT,
        ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.reconciliation,
        removeOnComplete: 100,
        removeOnFail: 100,
        deduplication: {
          id: `bedrock-embedding-reconciliation:${flow}`,
          mode: 'throttle',
          ttl: 60_000,
        },
      })
      expect(options.jobId).toBeUndefined()
    }
  })

  it('keeps page continuations in the same lane without a throttle or retained job ID', async () => {
    const after = `opaque-test-cursor-${randomUUID()}`
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
