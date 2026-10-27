import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import type {
  AIRetentionContinuationData,
  PsqlJobs,
  ModerationRetentionJobData,
  PsqlPartitionJobData,
  PsqlRetentionJobData,
  RefreshMaterializedViewData,
} from '@queues/psql/types'
import { QUEUE_NAME } from '@queues/psql/config'
import processPsql from './processors.mts'
import { processModerationRetentionCleanup } from './processors/moderation-retention.mts'
import { createAIRetentionContinuationProcessor } from './processors/retention-continuation.mts'
import type { Job } from 'glide-mq'

const processAIRetentionContinuation = createAIRetentionContinuationProcessor()

export const psql = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    return deferPostgresConnectionTimeout(job, async (): Promise<unknown> =>
      job.name === 'moderationRetentionCleanup'
        ? processModerationRetentionCleanup(job as Job<ModerationRetentionJobData>)
        : job.name === 'aiRetentionContinuation'
          ? processAIRetentionContinuation(job as Job<AIRetentionContinuationData>)
          : processPsql(
              job.name as PsqlJobs,
              job.data as Partial<
                RefreshMaterializedViewData & PsqlPartitionJobData & PsqlRetentionJobData
              >,
              undefined,
              job.id,
            ),
    )
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
