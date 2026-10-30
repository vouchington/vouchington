import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { DATA_RETENTION_ORDERING, PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { psql } from '../queues.mts'
import type { AgentModerationRetentionContinuationData, PsqlJobs } from '../types.mts'

const enqueueAgentModerationRetentionJob = createEnqueueFunction<
  AgentModerationRetentionContinuationData,
  PsqlJobs
>({ queue: psql, queueName: QUEUE_NAME, jobName: 'continueAgentModerationRetentionCleanup' })

export function enqueueAgentModerationRetentionContinuation(
  data: AgentModerationRetentionContinuationData,
) {
  const jobId = `agent-moderation-retention__${data.runId}__${data.step}`
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [data],
    jobIdOf: () => jobId,
    enqueueBulk: async inputs => {
      const jobs = await Promise.all(
        inputs.map(input =>
          enqueueAgentModerationRetentionJob(input, {
            jobId,
            priority: PRIORITY_DEFAULT,
            ordering: DATA_RETENTION_ORDERING,
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
