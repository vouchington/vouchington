import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  TOP_HASHTAGS_DEDUPLICATION_TTL_MS,
  TOP_HASHTAGS_VIEW,
} from './config.mts'
import { psql } from './queues.mts'
import type { PsqlJobs, RefreshMaterializedViewData } from './types.mts'

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
        ttl: TOP_HASHTAGS_DEDUPLICATION_TTL_MS,
      },
      ordering: { key: 'mv_refresh', concurrency: 1 },
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
    },
  )
