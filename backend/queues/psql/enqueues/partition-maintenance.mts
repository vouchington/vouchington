import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import {
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  getPartitionCleanupJobOptions,
  partitionCleanupConfig,
} from '../config.mts'
import { psql } from '../queues.mts'
import type { PsqlJobs, PsqlPartitionJobData } from '../types.mts'

function createPartitionEnqueue(jobName: 'createPartitions' | 'cleanupPartitions') {
  const enqueue = createEnqueueFunction<PsqlPartitionJobData, PsqlJobs>({
    queue: psql,
    queueName: QUEUE_NAME,
    jobName,
  })
  return async (rangeData?: PsqlPartitionJobData): EnqueueReturnType => {
    if (!rangeData?.classifierRange && !rangeData?.requestRange) {
      if (jobName === 'cleanupPartitions') await partitionCleanupConfig.waitForInitialization()
      return enqueue(
        {},
        jobName === 'cleanupPartitions'
          ? getPartitionCleanupJobOptions()
          : { priority: PRIORITY_DEFAULT },
      )
    }
    if (rangeData.classifierRange && rangeData.requestRange)
      throw new Error('Only one partition range family may be requested')
    const classifierRange = rangeData.classifierRange
    const requestRange = rangeData.requestRange
    const selectedRange = classifierRange ?? requestRange!
    const family = classifierRange ? 'classifier' : 'request'
    const operation = jobName === 'createPartitions' ? 'create' : 'retire'
    const jobId = `${family}-range__${operation}__${selectedRange.fromDate}_${selectedRange.toDate}`
    const jobs = await enqueueBulkReactivatingFinished({
      queue: psql,
      inputs: [selectedRange],
      jobIdOf: () => jobId,
      enqueueBulk: async inputs => {
        const added = await Promise.all(
          inputs.map(range =>
            enqueue(classifierRange ? { classifierRange: range } : { requestRange: range }, {
              priority: PRIORITY_DEFAULT,
              jobId,
              ordering: { key: 'operator_partitions', concurrency: 1 },
            }),
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

const enqueuePartitionCleanupContinuationJob = createEnqueueFunction<
  PsqlPartitionJobData,
  PsqlJobs
>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: 'cleanupPartitions',
})

export async function enqueueCleanupPartitionsContinuation(
  continuation: NonNullable<PsqlPartitionJobData['partitionContinuation']>,
): EnqueueReturnType {
  await partitionCleanupConfig.waitForInitialization()
  return enqueuePartitionCleanupContinuationJob(
    { partitionContinuation: continuation },
    {
      ...getPartitionCleanupJobOptions(),
      jobId: `psql__partition-cleanup__${continuation.rootJobId}__${continuation.step}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}
