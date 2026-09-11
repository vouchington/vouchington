import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME, REPORT_INTEGRITY_DEDUPLICATION_TTL_MS } from './config.mts'
import { reportIntegrityQueue } from './queues.mts'
import type { ProcessReportIntegrityCheckData, ReportIntegrityJobs } from './types.mts'

type PendingReportEntity = { entityType: string; entityId: string }

const JOB_NAME: ReportIntegrityJobs = 'processReportIntegrityCheck'

const enqueueReportIntegrityCheckJob = createEnqueueFunction<
  ProcessReportIntegrityCheckData,
  ReportIntegrityJobs
>({
  queue: reportIntegrityQueue,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
})

export function enqueueReportIntegrityCheck(
  entityType: string,
  entityId: string,
): EnqueueReturnType {
  return enqueueReportIntegrityCheckJob({ entityType, entityId }, {
    priority: PRIORITY_DEFAULT,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100,
    deduplication: {
      id: `processReportIntegrityCheck__${entityType}__${entityId}`,
      mode: 'debounce',
      ttl: REPORT_INTEGRITY_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

// Bulk enqueue for backfill dispatcher: one addBulk call per batch, not one per entity.
export const enqueueReportIntegrityCheckBatch = createBulkEnqueueFunction<
  PendingReportEntity,
  ProcessReportIntegrityCheckData,
  'processReportIntegrityCheck'
>({
  queue: reportIntegrityQueue,
  queueName: QUEUE_NAME,
  jobName: 'processReportIntegrityCheck',
  buildJob: (e: PendingReportEntity) => ({
    data: { entityType: e.entityType, entityId: e.entityId },
    opts: {
      priority: PRIORITY_DEFAULT,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        id: `processReportIntegrityCheck__${e.entityType}__${e.entityId}`,
        mode: 'debounce',
        ttl: REPORT_INTEGRITY_DEDUPLICATION_TTL_MS,
      },
    } satisfies Partial<JobOptions>,
  }),
})

const enqueueBackfillReportIntegrityJob = createEnqueueFunction<
  Record<string, never>,
  'backfill_report_integrity'
>({
  queue: reportIntegrityQueue,
  queueName: QUEUE_NAME,
  jobName: 'backfill_report_integrity',
})

export function enqueueBackfillReportIntegrity(): ReturnType<
  typeof enqueueBackfillReportIntegrityJob
> {
  return enqueueBackfillReportIntegrityJob(
    {},
    {
      priority: 100,
      deduplication: { id: 'backfill_report_integrity', mode: 'throttle', ttl: 3_600_000 },
    },
  )
}
