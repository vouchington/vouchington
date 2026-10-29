import { createHash } from 'node:crypto'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import type { EnqueueReturnType } from '@voucha/types'
import {
  DATA_RETENTION_ORDERING,
  DATA_RETENTION_RETRY_OPTIONS,
  PRIORITY_DEFAULT,
  PSQL_RETRY_OPTIONS,
  QUEUE_NAME,
  TOP_HASHTAGS_VIEW,
  VOTE_RETENTION_CONTINUATION_JOB_NAME,
} from './config.mts'
import { psql } from './queues.mts'
import { enqueueAIRetentionContinuations } from './enqueues/ai-retention.mts'
export { enqueueAIRetentionContinuations }
export {
  enqueueCreatePartitions,
  enqueueCleanupPartitions,
  enqueueCleanupPartitionsContinuation,
} from './enqueues/partition-maintenance.mts'
import type {
  PsqlJobs,
  PsqlRetentionJobData,
  RefreshMaterializedViewData,
  VoteRetentionContinuationData,
} from './types.mts'

function createPsqlEnqueue(jobName: PsqlJobs) {
  const enqueue = createEnqueueFunction<Record<string, never>, PsqlJobs>({
    queue: psql,
    queueName: QUEUE_NAME,
    jobName,
  })

  return (): EnqueueReturnType => {
    return enqueue({}, { priority: PRIORITY_DEFAULT })
  }
}

export const enqueueRunMigrations = createPsqlEnqueue('runMigrations')
export const enqueueRunViews = createPsqlEnqueue('runViews')
export const enqueueRunConfigDriven = createPsqlEnqueue('runConfigDriven')
export const enqueueReconcileVoteDrift = createPsqlEnqueue('reconcileVoteDrift')

const enqueueRetentionJob = createEnqueueFunction<PsqlRetentionJobData, PsqlJobs>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: 'dataRetentionCleanup',
})

export const enqueueDataRetentionCleanup = (): EnqueueReturnType =>
  enqueueRetentionJob({}, { priority: PRIORITY_DEFAULT, ordering: DATA_RETENTION_ORDERING })

export function enqueueDataRetentionCleanupContinuation(
  data: NonNullable<PsqlRetentionJobData['continuation']>,
) {
  const jobId = data.copyrightFamilies
    ? `data-retention-copyright__${data.runId}__${data.step}`
    : `data-retention-cleanup__${data.runId}__${data.step}`
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [{ continuation: data }],
    jobIdOf: () => jobId,
    enqueueBulk: async inputs => {
      const jobs = await Promise.all(
        inputs.map(input =>
          enqueueRetentionJob(input, {
            jobId,
            priority: PRIORITY_DEFAULT,
            ordering: DATA_RETENTION_ORDERING,
            ...(data.userPurge ? { sensitive: true } : {}),
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
            removeOnComplete: true,
            removeOnFail: true,
          }),
        ),
      )
      return jobs.filter(job => job !== null)
    },
  })
}

type RetentionContinuationInput = { parentJobId: string; data: VoteRetentionContinuationData }

// A running job cannot re-add its own id. The selected families are part of the
// child identity because a retried parent may observe a different remaining set.
const dataRetentionContinuationId = (input: RetentionContinuationInput) => {
  const { parentJobId, data } = input
  const identity = JSON.stringify([
    parentJobId,
    data.voteTables.toSorted(),
    data.userAgentStrings,
    data.voteIntegrityDetails,
  ])
  return `vote-retention__${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

const enqueueBulkDataRetentionContinuations = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: VOTE_RETENTION_CONTINUATION_JOB_NAME,
  defaults: {
    ...DATA_RETENTION_RETRY_OPTIONS,
    ordering: DATA_RETENTION_ORDERING,
    removeOnComplete: true,
    removeOnFail: true,
  },
  buildJob: (input: RetentionContinuationInput, _index: number) => ({
    data: input.data,
    opts: {
      jobId: dataRetentionContinuationId(input),
      priority: getDeployEnvironment() === 'staging' ? PRIORITY_DEFAULT + 10 : PRIORITY_DEFAULT,
    },
  }),
})

export function enqueueDataRetentionContinuation(
  parentJobId: string,
  data: VoteRetentionContinuationData,
) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [{ parentJobId, data }],
    jobIdOf: dataRetentionContinuationId,
    enqueueBulk: enqueueBulkDataRetentionContinuations,
  })
}

const enqueueRefreshMaterializedViewJob = createEnqueueFunction<
  RefreshMaterializedViewData,
  PsqlJobs
>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: 'refreshMaterializedView',
})

export const enqueueRefreshMaterializedView = (viewName: string): EnqueueReturnType =>
  enqueueRefreshMaterializedViewJob(
    { viewName },
    {
      priority: PRIORITY_DEFAULT,
      ordering: { key: 'mv_refresh', concurrency: 1 },
      ...PSQL_RETRY_OPTIONS,
    },
  )

export const enqueueRefreshTopHashtags = (): EnqueueReturnType =>
  enqueueRefreshMaterializedViewJob(
    { viewName: TOP_HASHTAGS_VIEW },
    {
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: 'refresh-materialized-view__mv_top_hashtags',
        mode: 'debounce' as const,
      },
      ordering: { key: 'mv_refresh', concurrency: 1 },
      ...PSQL_RETRY_OPTIONS,
    },
  )
