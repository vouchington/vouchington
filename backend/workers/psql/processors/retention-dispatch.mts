import {
  DATA_RETENTION_JOB_NAME,
  OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME,
} from '@queues/psql/config'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import type { Job } from 'glide-mq'
import type { createOperationalTombstoneRetentionHandlers } from './operational-tombstone-retention.mts'

type DailyCompletion = Parameters<
  ReturnType<typeof createOperationalTombstoneRetentionHandlers>['admitPending']
>[0]

/** Copyright-only continuations carry no daily federation or tombstone results to admit from. */
export function admitsDailyRetentionResults(job: Job): boolean {
  return (
    job.name === DATA_RETENTION_JOB_NAME &&
    !(job.data as PsqlRetentionJobData).continuation?.copyrightFamilies
  )
}

/** Registers retained routing and the daily completion gate around the actual maintenance port. */
export function createPsqlRetentionDispatcher({
  processRetained,
  processDefault,
  admitPending,
}: {
  processRetained: (job: Job) => Promise<unknown>
  processDefault: (job: Job) => Promise<unknown>
  admitPending: (result: DailyCompletion) => Promise<void>
}) {
  return (job: Job) =>
    deferPostgresConnectionTimeout(job, async () => {
      if (job.name === OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME) return processRetained(job)
      const result = await processDefault(job)
      if (admitsDailyRetentionResults(job)) await admitPending(result as DailyCompletion)
      return result
    })
}
