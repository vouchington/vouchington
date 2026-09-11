import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  POST_PUBLICATION_ORDERING,
  PRIORITY_RECONCILIATION,
  QUEUE_NAME,
  RECONCILIATION_DEDUPLICATION_ID,
  RECONCILIATION_DEDUPLICATION_TTL_MS,
} from './config.mts'
import { postPublication } from './queues.mts'
import type {
  PostPublicationJobs,
  PostPublicationShadowAuditJobData,
  ReviewSuccessionHistoryAuditJobData,
} from './types.mts'

const enqueueReconciliationJob = createEnqueueFunction<Record<string, never>, PostPublicationJobs>({
  queue: postPublication,
  queueName: QUEUE_NAME,
  jobName: 'processReconcilePostPublication',
})

/** Throttled durable-work dispatcher used by the scheduler and an operator backfill. */
export function enqueueReconcilePostPublication(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  const deduplicationId = options.deduplicationId ?? RECONCILIATION_DEDUPLICATION_ID
  return enqueueReconciliationJob(
    {},
    {
      priority: PRIORITY_RECONCILIATION,
      ordering: POST_PUBLICATION_ORDERING.reconciliation,
      deduplication: {
        id: deduplicationId,
        mode: 'throttle',
        ttl: RECONCILIATION_DEDUPLICATION_TTL_MS,
      },
    },
  )
}

/** Chains the next bounded page without throttle deduplication; ordering remains globally serial. */
export function enqueueContinuePostPublicationReconciliation(): EnqueueReturnType {
  return enqueueReconciliationJob(
    {},
    { priority: PRIORITY_RECONCILIATION, ordering: POST_PUBLICATION_ORDERING.reconciliation },
  )
}

const enqueueShadowAuditJob = createEnqueueFunction<
  PostPublicationShadowAuditJobData,
  PostPublicationJobs
>({
  queue: postPublication,
  queueName: QUEUE_NAME,
  jobName: 'processShadowAuditPostPublication',
})

/** Operator-triggered bounded shadow audit. Dry runs are read-only. */
export function enqueuePostPublicationShadowAudit(dryRun: boolean): EnqueueReturnType {
  return enqueueShadowAuditJob(
    { dryRun, cursor: null },
    { priority: PRIORITY_RECONCILIATION, ordering: POST_PUBLICATION_ORDERING.reconciliation },
  )
}

/** Continues a multi-page audit without throttle deduplication. */
export function enqueueContinuePostPublicationShadowAudit(
  dryRun: boolean,
  cursor: string,
): EnqueueReturnType {
  return enqueueShadowAuditJob(
    { dryRun, cursor },
    { priority: PRIORITY_RECONCILIATION, ordering: POST_PUBLICATION_ORDERING.reconciliation },
  )
}

const enqueueReviewSuccessionHistoryAuditJob = createEnqueueFunction<
  ReviewSuccessionHistoryAuditJobData,
  PostPublicationJobs
>({
  queue: postPublication,
  queueName: QUEUE_NAME,
  jobName: 'processAuditReviewSuccessionHistory',
})

/** Starts a read-only, UUID-paged audit of pre-cutover review succession history. */
export function enqueueAuditReviewSuccessionHistory(): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob(
    { cursor: null, cutoffArchivedAt: null },
    { priority: PRIORITY_RECONCILIATION, ordering: POST_PUBLICATION_ORDERING.reconciliation },
  )
}

/** Continues the same frozen historical scope after a full audit page. */
export function enqueueContinueAuditReviewSuccessionHistory(
  cursor: string,
  cutoffArchivedAt: string,
): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob(
    { cursor, cutoffArchivedAt },
    { priority: PRIORITY_RECONCILIATION, ordering: POST_PUBLICATION_ORDERING.reconciliation },
  )
}
