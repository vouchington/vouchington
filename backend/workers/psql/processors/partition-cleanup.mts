import { createHash } from 'node:crypto'
import { cleanupPartitions } from '@data-stores/psql/migration-runner/monthly-partitions'
import { enqueueCleanupPartitionsContinuation } from '@queues/psql/enqueues'
import { getPartitionCleanupLimit, partitionCleanupConfig } from '@queues/psql/config'
import type { PsqlPartitionJobData } from '@queues/psql/types'

export type PartitionCleanupDependencies = {
  cleanupPartitions: typeof cleanupPartitions
  enqueueCleanupPartitionsContinuation: typeof enqueueCleanupPartitionsContinuation
}

export async function processMonthlyPartitionCleanup(
  continuation: PsqlPartitionJobData['partitionContinuation'],
  dependencies?: Partial<PartitionCleanupDependencies>,
  jobId?: string,
) {
  await partitionCleanupConfig.waitForInitialization()
  const partitionReferenceDate = continuation ? new Date(continuation.referenceDate) : new Date()
  if (!Number.isFinite(partitionReferenceDate.getTime()))
    throw new Error('Invalid partition cleanup reference date')
  const partitionResult = await (dependencies?.cleanupPartitions ?? cleanupPartitions)(
    partitionReferenceDate,
    {
      limit: getPartitionCleanupLimit(),
      after: continuation?.after,
    },
  )
  if (partitionResult.hasMore) {
    if (!jobId || !partitionResult.nextCursor)
      throw new Error('Partition cleanup continuation needs a job ID and cursor')
    await (
      dependencies?.enqueueCleanupPartitionsContinuation ?? enqueueCleanupPartitionsContinuation
    )({
      rootJobId: continuation?.rootJobId ?? createHash('sha256').update(jobId).digest('hex'),
      step: (continuation?.step ?? 0) + 1,
      referenceDate: partitionReferenceDate.toISOString(),
      after: partitionResult.nextCursor,
    })
  }
  return partitionResult
}
