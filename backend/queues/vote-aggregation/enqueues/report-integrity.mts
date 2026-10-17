import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { REPORT_INTEGRITY_DEDUPLICATION_TTL_MS } from './config-report-integrity.mts'

type PendingReportEntity = { entityType: string; entityId: string }

function reportIntegrityDeduplication(entityType: string, entityId: string) {
  return {
    id: `processReportIntegrityCheck__${entityType}__${entityId}`,
    mode: 'debounce' as const,
    ttl: REPORT_INTEGRITY_DEDUPLICATION_TTL_MS,
  }
}

const enqueueReportIntegrityCheckJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
)

export function enqueueReportIntegrityCheck(
  entityType: string,
  entityId: string,
): EnqueueReturnType {
  return enqueueReportIntegrityCheckJob(
    { entityType, entityId },
    { deduplication: reportIntegrityDeduplication(entityType, entityId) },
  )
}

// Bulk enqueue for the backfill dispatcher: one addBulk call per page, not one per entity.
export const enqueueReportIntegrityCheckBatch = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
  (entity: PendingReportEntity) => ({
    data: { entityType: entity.entityType, entityId: entity.entityId },
    opts: { deduplication: reportIntegrityDeduplication(entity.entityType, entity.entityId) },
  }),
)

const enqueueBackfillReportIntegrityJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
)

/** Starts the backfill at the first page; an operator run is throttled for an hour. */
export function enqueueBackfillReportIntegrity(): EnqueueReturnType {
  return enqueueBackfillReportIntegrityJob(
    {},
    { deduplication: { id: 'backfill_report_integrity', mode: 'throttle', ttl: 3_600_000 } },
  )
}

/** Continues the backfill after the last entity id of the previous page. */
export function enqueueContinueBackfillReportIntegrity(afterId: string): EnqueueReturnType {
  return enqueueBackfillReportIntegrityJob(
    { afterId },
    { jobId: `backfill_report_integrity__${afterId}`, removeOnComplete: true, removeOnFail: true },
  )
}
