import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME, TOP_HASHTAGS_VIEW } from './config.mts'
import { psql } from './queues.mts'
import { enqueueAIRetentionContinuations } from './enqueues/ai-retention.mts'
export { enqueueAIRetentionContinuations }
import type {
  ClassifierPartitionRange,
  PsqlJobs,
  PsqlPartitionJobData,
  PsqlRetentionJobData,
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
export const enqueueReconcileVoteDrift = createPsqlEnqueue('reconcileVoteDrift')

const enqueueRetentionJob = createEnqueueFunction<PsqlRetentionJobData, PsqlJobs>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: 'dataRetentionCleanup',
})
const retentionOrdering = { key: 'data_retention:cleanup', concurrency: 1 } as const

export const enqueueDataRetentionCleanup = (): EnqueueReturnType =>
  enqueueRetentionJob({}, { priority: PRIORITY_DEFAULT, ordering: retentionOrdering })

export function enqueueDataRetentionCleanupContinuation(
  data: NonNullable<PsqlRetentionJobData['continuation']>,
) {
  const jobId = `data-retention-cleanup__${data.runId}__${data.step}`
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
            ordering: retentionOrdering,
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

function createPartitionEnqueue(jobName: 'createPartitions' | 'cleanupPartitions') {
  const enqueue = createEnqueueFunction<PsqlPartitionJobData, PsqlJobs>({
    queue: psql,
    queueName: QUEUE_NAME,
    jobName,
  })
  return async (classifierRange?: ClassifierPartitionRange): EnqueueReturnType => {
    if (!classifierRange) return enqueue({}, { priority: PRIORITY_DEFAULT })
    const operation = jobName === 'createPartitions' ? 'create' : 'retire'
    const jobId = `classifier-range__${operation}__${classifierRange.fromDate}_${classifierRange.toDate}`
    const jobs = await enqueueBulkReactivatingFinished({
      queue: psql,
      inputs: [classifierRange],
      jobIdOf: () => jobId,
      enqueueBulk: async inputs => {
        const added = await Promise.all(
          inputs.map(range =>
            enqueue(
              { classifierRange: range },
              {
                priority: PRIORITY_DEFAULT,
                jobId,
                ordering: { key: 'classifier_partitions', concurrency: 1 },
              },
            ),
          ),
        )
        return added.filter(job => job !== null)
      },
    })
    return jobs[0]
  }
}

export const enqueueCreatePartitions = createPartitionEnqueue('createPartitions')
export const enqueueCleanupPartitions = createPartitionEnqueue('cleanupPartitions')

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
