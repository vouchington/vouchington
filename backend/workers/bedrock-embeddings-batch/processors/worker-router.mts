import type { ReconciliationEntityType } from '@queues/bedrock-embeddings-batch/types'
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
import { UnrecoverableError } from '@vouchington/queue-errors'
import { decodeScopedUuidCursor } from '@modules/pagination'

type JobData = Record<string, unknown>

export const processBedrockEmbeddingsBatchJob = async (
  job: Job<JobData>,
  scope?: { entityIds?: readonly string[] },
): Promise<unknown> => {
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'bedrock-embeddings:polling': {
      switch (job.name) {
        case 'bedrock-embeddings.poll_batch': {
          const batchId = job.data?.batch_id
          if (!batchId) throw new Error('Batch ID is required')
          return processBatchPolling(batchId as string)
        }
        default:
          throw new Error(`Unknown polling job type: ${job.name}`)
      }
    }
    case 'bedrock-embeddings:dispatcher': {
      switch (job.name) {
        case 'bedrock-embeddings.poll_dispatcher':
          return processBatchPollingDispatcher()
        case 'bedrock-embeddings.creation_dispatcher':
          return processBatchCreationDispatcher()
        case 'bedrock-embeddings.backlog_dispatcher':
          return processBacklogDispatcher()
        case 'bedrock-embeddings.stale_cleanup_dispatcher':
          return processStaleCleanupDispatcher()
        default:
          throw new Error(`Unknown dispatcher job type: ${job.name}`)
      }
    }
    case 'bedrock-embeddings:reconciliation': {
      switch (job.name) {
        case 'bedrock-embeddings.reconcile_existing': {
          const data = assertReconciliationPayload(job.data, ['entityType'], ['after'])
          const entityType = data.entityType
          if (
            entityType !== 'topics' &&
            entityType !== 'posts' &&
            entityType !== 'rss_feed_items'
          ) {
            throw new UnrecoverableError('Invalid reconciliation entity type')
          }
          assertReconciliationCursor(data.after, `embedding-reconciliation:${entityType}:id-asc`)
          return processExistingEmbeddingReconciliation(
            entityType as ReconciliationEntityType,
            data.after as string | undefined,
            scope?.entityIds,
          )
        }
        case 'bedrock-embeddings.post_trigger_recovery': {
          const data = assertReconciliationPayload(job.data, [], ['after'])
          assertReconciliationCursor(data.after, 'ban-evasion:post-embedding:pending:id-asc')
          return processPostEmbeddingTriggerRecovery(data.after as string | undefined)
        }
        default:
          throw new UnrecoverableError(`Unknown reconciliation job type: ${job.name}`)
      }
    }
    default:
      throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
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
): Record<string, unknown> {
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
  return data
}
