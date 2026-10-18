import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT } from '../config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { ReconciliationEntityType, ReconciliationFlow } from '../types.mts'

const RECONCILIATION_ROOT_THROTTLE_MS = 60_000
export function reconciliationJobOptions(flow: ReconciliationFlow, after?: string): JobOptions {
  const id = `bedrock-embeddings:reconciliation:${flow}`
  return {
    ...requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing').options,
    priority: PRIORITY_DEFAULT,
    deduplication:
      after === undefined
        ? { id, mode: 'throttle', ttl: RECONCILIATION_ROOT_THROTTLE_MS }
        : { id: `${id}:${after}`, mode: 'simple' },
  }
}

const enqueueReconcileExisting = createEnqueueFunction<
  { entityType: ReconciliationEntityType; after?: string },
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.reconcile_existing',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing').options,
})

const enqueuePostTriggerRecoveryJob = createEnqueueFunction<{ after?: string }, string>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.post_trigger_recovery',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.post_trigger_recovery').options,
})

export function enqueueReconcileExistingEmbeddings(
  entityType: ReconciliationEntityType,
  after?: string,
): EnqueueReturnType {
  const data = after === undefined ? { entityType } : { entityType, after }
  return enqueueReconcileExisting(data, reconciliationJobOptions(`copy:${entityType}`, after))
}

export function enqueuePostEmbeddingTriggerRecovery(after?: string): EnqueueReturnType {
  const data = after === undefined ? {} : { after }
  return enqueuePostTriggerRecoveryJob(data, reconciliationJobOptions('post-trigger', after))
}

export async function enqueueAllEmbeddingReconciliationRoots(): Promise<unknown[]> {
  return Promise.all([
    enqueueReconcileExistingEmbeddings('topics'),
    enqueueReconcileExistingEmbeddings('posts'),
    enqueueReconcileExistingEmbeddings('rss_feed_items'),
    enqueuePostEmbeddingTriggerRecovery(),
  ])
}
