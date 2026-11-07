import {
  createWorker,
  type NamedQueueJob,
} from '../data-stores/valkey-glide-mq/glide-mq-factory.mts'
import { backgroundHandler } from '../queues/background/enqueues/define-handler.mts'
import { defineBackgroundJob } from '../queues/background/enqueues/define-job.mts'
import type { BloomFilterJobPayloads } from '../queues/bloom-filters/types.mts'
import type { Job, Worker } from 'glide-mq'

const domain = undefined as never

/** Checked by backend tsc; this function is deliberately never invoked. */
export function assertTypedQueueContractsAtCompileTime(): void {
  const bloomJob = undefined as unknown as NamedQueueJob<BloomFilterJobPayloads>
  if (bloomJob.name === 'processBackfillBloomFilter') {
    const entityType: BloomFilterJobPayloads['processBackfillBloomFilter']['entityType'] =
      bloomJob.data.entityType
    void entityType
    // @ts-expect-error a sibling job's payload is unavailable after name narrowing
    void bloomJob.data.userId
  }
  const enqueueBackfill =
    undefined as unknown as typeof import('../queues/bloom-filters/enqueues.mts').enqueueBackfillBloomFilter
  void enqueueBackfill({ entityType: 'posts' })
  // @ts-expect-error the real backfill producer rejects a sibling user payload
  void enqueueBackfill({ userId: 'user-id' })

  const inferredWorker = createWorker('inference-check', async job => {
    void job.data
    return { ok: true }
  })
  const workerWithInferredResult: Worker<unknown, { ok: boolean }> = inferredWorker
  void workerWithInferredResult

  const idDefinition = defineBackgroundJob<{ id: string }>(domain, {
    name: 'id-payload',
    priority: 10,
  })
  // @ts-expect-error a handler cannot assume a field absent from its producer payload
  backgroundHandler(idDefinition, (job: Job<{ id: string; missing: string }>) => job.data.missing)
}
