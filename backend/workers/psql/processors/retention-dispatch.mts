import {
  DATA_RETENTION_JOB_NAME,
  OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME,
} from '@queues/psql/config'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import type { PsqlJob } from '@queues/psql/types'
import type { Job } from 'glide-mq'
import type { createOperationalTombstoneRetentionHandlers } from './operational-tombstone-retention.mts'

type DailyCompletion = Parameters<
  ReturnType<typeof createOperationalTombstoneRetentionHandlers>['admitPending']
>[0]

/** Copyright-only continuations carry no daily federation or tombstone results to admit from. */
export function admitsDailyRetentionResults(job: PsqlJob): boolean {
  return job.name === DATA_RETENTION_JOB_NAME && !job.data.continuation?.copyrightFamilies
}

/** Registers retained routing and the daily completion gate around the actual maintenance port. */
export function createPsqlRetentionDispatcher({
  processRetained,
  processDefault,
  admitPending,
}: {
  processRetained: (
    job: Extract<PsqlJob, { name: typeof OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME }>,
  ) => Promise<unknown>
  processDefault: (job: PsqlJob) => Promise<unknown>
  admitPending: (result: DailyCompletion) => Promise<void>
}) {
  return (job: Job) =>
    deferPostgresConnectionTimeout(job, async () => {
      const typedJob = job as PsqlJob
      if (typedJob.name === OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME)
        return processRetained(typedJob)
      const result = await processDefault(typedJob)
      if (admitsDailyRetentionResults(typedJob)) await admitPending(result as DailyCompletion)
      return result
    })
}
