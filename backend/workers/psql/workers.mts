import { cleanupActivityPubTerminalIdentities } from '@services/data-retention/cleanup-activitypub-tombstones'
import { cleanupOperationalTombstones } from '@services/data-retention/cleanup-operational-tombstones'
import { createOperationalTombstoneRetentionHandlers } from './processors/operational-tombstone-retention.mts'
import { psql as psqlQueue } from '@queues/psql/queues'
import {
  admitsDailyRetentionResults,
  createPsqlRetentionDispatcher,
} from './processors/retention-dispatch.mts'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  admitPendingTerminalActivityRetention,
  createTerminalActivityRetentionProcessor,
} from './processors/activitypub-terminal-retention.mts'
import {
  COPYRIGHT_CASE_PURGE_JOB_NAME,
  COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME,
  TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
  QUEUE_NAME,
} from '@queues/psql/config'
import type {
  AIRetentionContinuationData,
  CopyrightAccountClockSyncJobData,
  CopyrightCasePurgeJobData,
  ModerationRetentionJobData,
  PsqlJobs,
  PsqlPartitionJobData,
  PsqlRetentionJobData,
  RefreshMaterializedViewData,
  TerminalActivityRetentionData,
  VoteRetentionContinuationData,
} from '@queues/psql/types'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import processPsql from './processors.mts'
import { processModerationRetentionCleanup } from './processors/moderation-retention.mts'
import { createAIRetentionContinuationProcessor } from './processors/retention-continuation.mts'
import type { Job } from 'glide-mq'
import { processCopyrightCasePurge } from './processors/copyright-case-purge.mts'
import { processCopyrightAccountClockSync } from './processors/copyright-account-clock-sync.mts'

const processTerminalActivityRetention = createTerminalActivityRetentionProcessor(
  cleanupActivityPubTerminalIdentities,
)
const processAIRetentionContinuation = createAIRetentionContinuationProcessor()
const operationalTombstoneRetention = createOperationalTombstoneRetentionHandlers(
  psqlQueue,
  cleanupOperationalTombstones,
)

async function processPsqlJob(job: Job): Promise<unknown> {
  if (job.name === COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME) {
    return processCopyrightAccountClockSync(job as Job<CopyrightAccountClockSyncJobData>)
  }
  if (job.name === COPYRIGHT_CASE_PURGE_JOB_NAME) {
    return processCopyrightCasePurge(job as Job<CopyrightCasePurgeJobData>)
  }
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
    job.data as Partial<
      RefreshMaterializedViewData &
        PsqlPartitionJobData &
        PsqlRetentionJobData &
        VoteRetentionContinuationData
    >,
    undefined,
    job.id,
  )
  if (admitsDailyRetentionResults(job)) {
    await admitPendingTerminalActivityRetention(
      result as Awaited<ReturnType<typeof runDataRetentionCleanup>>,
    )
  }
  return result
}

export const psql = createWorker(
  QUEUE_NAME,
  createPsqlRetentionDispatcher({
    processRetained: operationalTombstoneRetention.processRetained,
    admitPending: operationalTombstoneRetention.admitPending,
    processDefault: processPsqlJob,
  }),
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
