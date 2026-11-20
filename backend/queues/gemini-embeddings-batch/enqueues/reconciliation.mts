import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { ReconciliationEntityType, ReconciliationFlow } from '../types.mts'

const RECONCILIATION_ROOT_THROTTLE_MS = 60_000
export function reconciliationJobOptions(flow: ReconciliationFlow, after?: string): JobOptions {
  const id = `gemini-embeddings:reconciliation:${flow}`
  return {
    ...requireBackgroundCpuJob('gemini-embeddings.reconcile_existing').options,
    deduplication:
      after === undefined
        ? { id, mode: 'throttle', ttl: RECONCILIATION_ROOT_THROTTLE_MS }
        : { id: `${id}:${after}`, mode: 'simple' },
  }
}

const enqueueReconcileExisting = createBackgroundCpuEnqueueFunction(
  'gemini-embeddings.reconcile_existing',
)
const enqueuePostTriggerRecoveryJob = createBackgroundCpuEnqueueFunction(
  'gemini-embeddings.post_trigger_recovery',
)

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
