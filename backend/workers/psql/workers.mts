import { cleanupActivityPubTerminalIdentities } from '@services/data-retention/cleanup-activitypub-tombstones'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  admitPendingTerminalActivityRetention,
  createTerminalActivityRetentionProcessor,
} from './processors/activitypub-terminal-retention.mts'
import {
  TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
  DATA_RETENTION_JOB_NAME,
  QUEUE_NAME,
} from '@queues/psql/config'
import type {
  AIRetentionContinuationData,
  ModerationRetentionJobData,
  PsqlJobs,
  PsqlPartitionJobData,
  PsqlRetentionJobData,
  RefreshMaterializedViewData,
  TerminalActivityRetentionData,
} from '@queues/psql/types'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import processPsql from './processors.mts'
import { processModerationRetentionCleanup } from './processors/moderation-retention.mts'
import { createAIRetentionContinuationProcessor } from './processors/retention-continuation.mts'
import type { Job } from 'glide-mq'

const processTerminalActivityRetention = createTerminalActivityRetentionProcessor(
  cleanupActivityPubTerminalIdentities,
)
const processAIRetentionContinuation = createAIRetentionContinuationProcessor()

async function processPsqlJob(job: Job): Promise<unknown> {
  if (job.name === TERMINAL_ACTIVITY_RETENTION_JOB_NAME) {
    return processTerminalActivityRetention(job as Job<TerminalActivityRetentionData>)
  }
  if (job.name === 'moderationRetentionCleanup') {
    return processModerationRetentionCleanup(job as Job<ModerationRetentionJobData>)
  }
  if (job.name === 'aiRetentionContinuation') {
    return processAIRetentionContinuation(job as Job<AIRetentionContinuationData>)
  }
  const result = await processPsql(
    job.name as PsqlJobs,
    job.data as Partial<RefreshMaterializedViewData & PsqlPartitionJobData & PsqlRetentionJobData>,
    undefined,
    job.id,
  )
  if (job.name === DATA_RETENTION_JOB_NAME) {
    await admitPendingTerminalActivityRetention(
      result as Awaited<ReturnType<typeof runDataRetentionCleanup>>,
    )
  }
  return result
}

export const psql = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    return deferPostgresConnectionTimeout(job, () => processPsqlJob(job))
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
