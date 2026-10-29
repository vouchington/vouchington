import { createBulkEnqueueFunction, type PriorityQueue } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  DELETED_CONVERSATION_RETENTION_JOB_NAME,
  deletedConversationRetentionJobId,
  getDeletedConversationRetentionJobOptions,
} from '../config.mts'

/** Finished claims reactivate; live claims retain the one canonical family job. */
export function createDeletedConversationRetentionEnqueue(queue: PriorityQueue<unknown>) {
  const enqueueBulk = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: DELETED_CONVERSATION_RETENTION_JOB_NAME,
    buildJob: (data: Record<string, never>) => ({
      data,
      opts: getDeletedConversationRetentionJobOptions(),
    }),
  })
  return () =>
    enqueueBulkReactivatingFinished({
      queue,
      inputs: [{}],
      jobIdOf: () => deletedConversationRetentionJobId,
      enqueueBulk,
    })
}
