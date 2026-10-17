import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { RECONCILIATION_DEDUPLICATION_ID, RECONCILIATION_DEDUPLICATION_TTL_MS } from './config.mts'

const enqueueReconciliationJob = createBackgroundEnqueue(POST_PUBLICATION_RECONCILE_JOB)

/** Throttled durable-work dispatcher used by the scheduler and an operator backfill. */
export function enqueueReconcilePostPublication(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  const deduplicationId = options.deduplicationId ?? RECONCILIATION_DEDUPLICATION_ID
  return enqueueReconciliationJob(
    {},
    {
      deduplication: {
        id: deduplicationId,
        mode: 'throttle',
        ttl: RECONCILIATION_DEDUPLICATION_TTL_MS,
      },
    },
  )
}

/** Chains the next bounded page without throttle deduplication; the domain group stays serial. */
export function enqueueContinuePostPublicationReconciliation(): EnqueueReturnType {
  return enqueueReconciliationJob({})
}

const enqueueShadowAuditJob = createBackgroundEnqueue(POST_PUBLICATION_SHADOW_AUDIT_JOB)

/** Operator-triggered bounded shadow audit. Dry runs are read-only. */
export function enqueuePostPublicationShadowAudit(dryRun: boolean): EnqueueReturnType {
  return enqueueShadowAuditJob({ dryRun, cursor: null })
}

/** Continues a multi-page audit without throttle deduplication. */
export function enqueueContinuePostPublicationShadowAudit(
  dryRun: boolean,
  cursor: string,
): EnqueueReturnType {
  return enqueueShadowAuditJob({ dryRun, cursor })
}

const enqueueReviewSuccessionHistoryAuditJob = createBackgroundEnqueue(
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
)

/** Starts a read-only, UUID-paged audit of pre-cutover review succession history. */
export function enqueueAuditReviewSuccessionHistory(): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob({ cursor: null, cutoffArchivedAt: null })
}

/** Continues the same frozen historical scope after a full audit page. */
export function enqueueContinueAuditReviewSuccessionHistory(
  cursor: string,
  cutoffArchivedAt: string,
): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob({ cursor, cutoffArchivedAt })
}
