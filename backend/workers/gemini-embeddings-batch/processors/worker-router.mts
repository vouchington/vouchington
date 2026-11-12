import {
  processBatchPolling,
  processBatchPollingDispatcher,
  processBatchCreationDispatcher,
  processBacklogDispatcher,
  processStaleCleanupDispatcher,
  processExistingEmbeddingReconciliation,
  processPostEmbeddingTriggerRecovery,
} from '../processors.mts'
import type { Job } from 'glide-mq'
import type { NamedQueueJob } from '../../../data-stores/valkey-glide-mq/glide-mq-factory.mts'
import type { BackgroundCpuJobPayloads } from '../../../queues/background-cpu/types.mts'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { decodeScopedUuidCursor } from '@modules/pagination'

type BatchJob = NamedQueueJob<
  Pick<
    BackgroundCpuJobPayloads,
    | 'gemini-embeddings.poll_batch'
    | 'gemini-embeddings.poll_dispatcher'
    | 'gemini-embeddings.creation_dispatcher'
    | 'gemini-embeddings.backlog_dispatcher'
    | 'gemini-embeddings.stale_cleanup_dispatcher'
    | 'gemini-embeddings.reconcile_existing'
    | 'gemini-embeddings.post_trigger_recovery'
  >
>

export const processEmbeddingsBatchJob = async (
  rawJob: Job<unknown>,
  scope?: { entityIds?: readonly string[] },
): Promise<unknown> => {
  const job = rawJob as BatchJob
  const jobName = rawJob.name
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'gemini-embeddings:polling': {
      if (job.name === 'gemini-embeddings.poll_batch') {
        const batchId = job.data?.batch_id
        if (!batchId) throw new Error('Batch ID is required')
        return processBatchPolling(batchId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
      }
      throw new Error(`Unknown polling job type: ${jobName}`)
    }
    case 'gemini-embeddings:dispatcher': {
      if (job.name === 'gemini-embeddings.poll_dispatcher')
        return processBatchPollingDispatcher(job.data.cursor)
      if (job.name === 'gemini-embeddings.creation_dispatcher')
        return processBatchCreationDispatcher()
      if (job.name === 'gemini-embeddings.backlog_dispatcher') return processBacklogDispatcher()
      if (job.name === 'gemini-embeddings.stale_cleanup_dispatcher')
        return processStaleCleanupDispatcher(job.data.cursor)
      throw new Error(`Unknown dispatcher job type: ${jobName}`)
    }
    case 'gemini-embeddings:reconciliation': {
      if (job.name === 'gemini-embeddings.reconcile_existing') {
        const data = assertReconciliationPayload(job.data, ['entityType'], ['after'])
        const entityType = data.entityType
        if (entityType !== 'topics' && entityType !== 'posts' && entityType !== 'rss_feed_items') {
          throw new UnrecoverableError('Invalid reconciliation entity type')
        }
        assertReconciliationCursor(data.after, `embedding-reconciliation:${entityType}:id-asc`)
        return processExistingEmbeddingReconciliation(entityType, data.after, scope?.entityIds)
      }
      if (job.name === 'gemini-embeddings.post_trigger_recovery') {
        const data = assertReconciliationPayload(job.data, [], ['after'])
        assertReconciliationCursor(data.after, 'ban-evasion:post-embedding:pending:id-asc')
        return processPostEmbeddingTriggerRecovery(data.after)
      }
      throw new UnrecoverableError(`Unknown reconciliation job type: ${jobName}`)
    }
    case undefined:
      break
  }
  throw new Error(`Unknown ordering key: ${orderingKey}`)
}

function assertReconciliationCursor(after: unknown, scope: string): void {
  if (after === undefined) return
  try {
    decodeScopedUuidCursor(after as string, scope, 'Invalid reconciliation cursor')
  } catch {
    throw new UnrecoverableError('Invalid reconciliation cursor')
  }
}

function assertReconciliationPayload(
  value: unknown,
  requiredKeys: string[],
  optionalKeys: string[],
): Record<string, unknown> & { after?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnrecoverableError('Invalid reconciliation payload')
  }
  const data = value as Record<string, unknown>
  const allowedKeys = [...requiredKeys, ...optionalKeys]
  if (
    requiredKeys.some(key => !Object.hasOwn(data, key)) ||
    Object.keys(data).some(key => !allowedKeys.includes(key)) ||
    (Object.hasOwn(data, 'after') && typeof data.after !== 'string')
  ) {
    throw new UnrecoverableError('Invalid reconciliation payload')
  }
  return data as Record<string, unknown> & { after?: string }
}
