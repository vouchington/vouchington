import { createBulkEnqueueFunction, type PriorityQueue } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME,
  operationalTombstoneRetentionJobId,
  getOperationalTombstoneRetentionJobOptions,
} from '../config.mts'
import type { OperationalTombstoneRetentionData } from '../types.mts'

/** Finished claims reactivate; live claims retain the one canonical family job. */
export function createOperationalTombstoneRetentionEnqueue(queue: PriorityQueue<unknown>) {
  const enqueueBulk = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: OPERATIONAL_TOMBSTONE_RETENTION_JOB_NAME,
    buildJob: (data: OperationalTombstoneRetentionData) => ({
      data,
      opts: getOperationalTombstoneRetentionJobOptions(data.family),
    }),
  })
  return (families: OperationalTombstoneRetentionData['family'][]) =>
    enqueueBulkReactivatingFinished({
      queue,
      inputs: families.map(family => ({ family })),
      jobIdOf: data => operationalTombstoneRetentionJobId(data.family),
      enqueueBulk,
    })
}
