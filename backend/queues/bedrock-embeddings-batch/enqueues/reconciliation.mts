import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  BEDROCK_EMBEDDINGS_BATCH_DEFAULTS,
  BEDROCK_EMBEDDINGS_BATCH_ORDERING,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
} from '../config.mts'
import { bedrock_embeddings_batch } from '../queues.mts'
import type {
  ReconciliationEntityType,
  ReconciliationFlow,
  ReconciliationJobName,
} from '../types.mts'

const RECONCILIATION_ROOT_THROTTLE_MS = 60_000
const defaults = {
  attempts: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.attempts,
  backoff: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.backoff,
  removeOnComplete: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnComplete,
  removeOnFail: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

export function reconciliationJobOptions(flow: ReconciliationFlow, after?: string): JobOptions {
  const id = `bedrock-embedding-reconciliation:${flow}`
  return {
    ...defaults,
    priority: PRIORITY_DEFAULT,
    ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.reconciliation,
    deduplication:
      after === undefined
        ? { id, mode: 'throttle', ttl: RECONCILIATION_ROOT_THROTTLE_MS }
        : { id: `${id}:${after}`, mode: 'simple' },
  }
}

const enqueueReconcileExisting = createEnqueueFunction<
  { entityType: ReconciliationEntityType; after?: string },
  ReconciliationJobName
>({
  queue: bedrock_embeddings_batch,
  queueName: QUEUE_NAME,
  jobName: 'reconcile_existing',
  defaults,
})

const enqueuePostTriggerRecoveryJob = createEnqueueFunction<
  { after?: string },
  ReconciliationJobName
>({
  queue: bedrock_embeddings_batch,
  queueName: QUEUE_NAME,
  jobName: 'post_trigger_recovery',
  defaults,
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
