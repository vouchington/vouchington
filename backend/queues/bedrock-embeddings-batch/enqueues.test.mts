import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { isDeduplicatedEnqueue, readAllQueueJobs, readEnqueuedJob } from '@voucha/test-helpers'
import {
  enqueueReconcileExistingEmbeddings,
  reconciliationJobOptions,
  enqueueEmbeddingsBatchPollDispatcher,
  enqueueEmbeddingsBatchStaleCleanupDispatcher,
} from './enqueues.mts'
import { backgroundCpu as bedrock_embeddings_batch } from '@queues/background-cpu/queues'
import { PRIORITY_DISPATCHER } from './config.mts'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { reconciliationScheduleEntries } from './enqueues/reconciliation-schedules.mts'

describe('embedding reconciliation enqueues', () => {
  it.each([
    ['poll_dispatcher', enqueueEmbeddingsBatchPollDispatcher],
    ['stale_cleanup_dispatcher', enqueueEmbeddingsBatchStaleCleanupDispatcher],
  ] as const)('persists %s continuation with a cursor-specific identity', async (name, enqueue) => {
    const cursor = { afterId: randomUUID(), throughId: randomUUID() }
    const enqueued = await enqueue({ cursor })
    const job = await readEnqueuedJob(bedrock_embeddings_batch, enqueued)
    onTestFinished(() => job.remove())
    expect(job).toMatchObject({
      name: `bedrock-embeddings.${name}`,
      data: { cursor },
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: `bedrock-embeddings__${name}__${cursor.throughId}__${cursor.afterId}`,
      },
    })
    expect(job.opts.deduplication).toBeUndefined()
  })

  it('dispatches each scheduled copy root with its entity payload and reconciliation lane', async () => {
    for (const entityType of ['topics', 'posts', 'rss_feed_items'] as const) {
      const entry = reconciliationScheduleEntries.find(
        candidate =>
          candidate.schedulerId === `bedrock-embeddings:reconcile_existing_${entityType}`,
      )!
      const surface = entry.operatorSurfaces.find(candidate => candidate.kind === 'scheduled-jobs')!
      if (surface.kind !== 'scheduled-jobs') throw new Error('Missing scheduled trigger')
      const enqueued = await surface.trigger()
      const deduplicationId = `bedrock-embeddings:reconciliation:copy:${entityType}`
      const job = isDeduplicatedEnqueue(enqueued)
        ? (await readAllQueueJobs(bedrock_embeddings_batch)).find(
            queued => queued.opts.deduplication?.id === deduplicationId,
          )
        : await readEnqueuedJob(bedrock_embeddings_batch, enqueued)
      expect(job).toMatchObject({
        name: 'bedrock-embeddings.reconcile_existing',
        data: { entityType },
        opts: {
          ordering: requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing').options
            .ordering,
          deduplication: { id: deduplicationId },
        },
      })
    }
  })

  it('uses distinct 60-second throttles for all four roots without retained job IDs', () => {
    const flows = ['copy:topics', 'copy:posts', 'copy:rss_feed_items', 'post-trigger'] as const
    for (const flow of flows) {
      const options = reconciliationJobOptions(flow)
      expect(options).toMatchObject({
        attempts: 3,
        priority: PRIORITY_DISPATCHER,
        ordering: requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing').options.ordering,
        removeOnComplete: 100,
        removeOnFail: 100,
        deduplication: {
          id: `bedrock-embeddings:reconciliation:${flow}`,
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
      name: 'bedrock-embeddings.reconcile_existing',
      data: { entityType: 'topics', after },
      opts: {
        priority: PRIORITY_DISPATCHER,
        ordering: requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing').options.ordering,
        deduplication: {
          id: `bedrock-embeddings:reconciliation:copy:topics:${after}`,
          mode: 'simple',
        },
      },
    })
    expect(job.opts.deduplication).not.toHaveProperty('ttl')
    expect(job.opts.jobId).toBeUndefined()
    expect(reconciliationJobOptions('copy:topics').deduplication).toEqual({
      id: 'bedrock-embeddings:reconciliation:copy:topics',
      mode: 'throttle',
      ttl: 60_000,
    })
  })
})
