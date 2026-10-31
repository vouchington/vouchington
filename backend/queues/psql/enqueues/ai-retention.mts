import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { PRIORITY_DEFAULT } from '../config.mts'
import { psql } from '../queues.mts'
import type { AIRetentionFamily } from '../types.mts'
import { aiRetentionOrderingKey, getAIRetentionOrderingConcurrency } from './ordering-config.mts'

const aiRetentionContinuationId = (family: AIRetentionFamily): string =>
  `ai_retention_continuation__${family}`

const enqueueBulk = createBulkEnqueueFunction({
  queue: psql,
  queueName: psql.name,
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

/** Finished records may be re-admitted; an existing live sweep owns all further passes. */
export function enqueueAIRetentionContinuations(families: readonly AIRetentionFamily[]) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [...new Set(families)],
    jobIdOf: aiRetentionContinuationId,
    enqueueBulk,
  })
}
