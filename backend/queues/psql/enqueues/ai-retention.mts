import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { PRIORITY_DEFAULT } from '../config.mts'
import { psql } from '../queues.mts'
import type { AIRetentionFamily } from '../types.mts'
import { aiRetentionOrderingKey, getAIRetentionOrderingConcurrency } from './ordering-config.mts'

export const aiRetentionContinuationId = (family: AIRetentionFamily): string =>
  `ai_retention_continuation__${family}`

/** Finished records may be re-admitted; an existing live sweep owns all further passes. */
export function createAIRetentionContinuationEnqueue(
  queue: Pick<typeof psql, 'name' | 'addBulk' | 'priorityKind'> = psql,
) {
  const enqueueBulk = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: 'aiRetentionContinuation',
    buildJob: (family: AIRetentionFamily) => ({
      data: { family },
      opts: {
        jobId: aiRetentionContinuationId(family),
        priority: PRIORITY_DEFAULT,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 1_000, jitter: 0.5 },
        ordering: {
          key: aiRetentionOrderingKey(family),
          concurrency: getAIRetentionOrderingConcurrency(family),
        },
      },
    }),
  })
  return (families: readonly AIRetentionFamily[]) =>
    enqueueBulkReactivatingFinished({
      queue,
      inputs: [...new Set(families)],
      jobIdOf: aiRetentionContinuationId,
      enqueueBulk,
    })
}

export const enqueueAIRetentionContinuations = createAIRetentionContinuationEnqueue()
