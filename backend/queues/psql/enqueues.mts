import { createHash } from 'node:crypto'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import {
  DATA_RETENTION_ORDERING,
  DATA_RETENTION_RETRY_OPTIONS,
  MEMBERSHIP_RETENTION_CONTINUATION_JOB_NAME,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  TOP_HASHTAGS_VIEW,
} from './config.mts'
import { psql } from './queues.mts'
import type {
  MembershipRetentionContinuationData,
  PsqlJobs,
  RefreshMaterializedViewData,
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
export const enqueueCreatePartitions = createPsqlEnqueue('createPartitions')
export const enqueueCleanupPartitions = createPsqlEnqueue('cleanupPartitions')
export const enqueueDataRetentionCleanup = createPsqlEnqueue('dataRetentionCleanup')

type MembershipRetentionContinuationInput = {
  parentJobId: string
  data: MembershipRetentionContinuationData
}

function retentionContinuationId(input: MembershipRetentionContinuationInput): string {
  const { parentJobId, data } = input
  const identity = JSON.stringify([
    parentJobId,
    data.deliveredMembershipEntitlementEffects,
    data.endedMembershipRenewalNotices,
    data.terminalGooglePlayAcknowledgments,
  ])
  return `membership-retention__${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

const enqueueBulkRetentionContinuations = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: MEMBERSHIP_RETENTION_CONTINUATION_JOB_NAME,
  defaults: {
    ...DATA_RETENTION_RETRY_OPTIONS,
    removeOnComplete: true,
    removeOnFail: true,
  },
  buildJob: (input: MembershipRetentionContinuationInput, _index: number) => ({
    data: input.data,
    opts: {
      jobId: retentionContinuationId(input),
      priority: getDeployEnvironment() === 'staging' ? PRIORITY_DEFAULT + 10 : PRIORITY_DEFAULT,
      ordering: DATA_RETENTION_ORDERING,
    },
  }),
})

/** A capped retention run schedules the next page under a stable, bounded child id. */
export function enqueueMembershipRetentionContinuation(
  parentJobId: string,
  data: MembershipRetentionContinuationData,
) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [{ parentJobId, data }],
    jobIdOf: retentionContinuationId,
    enqueueBulk: enqueueBulkRetentionContinuations,
  })
}
export const enqueueReconcileVoteDrift = createPsqlEnqueue('reconcileVoteDrift')

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
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
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
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
    },
  )
