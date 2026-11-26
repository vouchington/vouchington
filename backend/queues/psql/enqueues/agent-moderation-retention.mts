import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { DATA_RETENTION_ORDERING, PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { psql } from '../queues.mts'
import type { AgentModerationRetentionContinuationData, PsqlJobPayloads } from '../types.mts'

const agentModerationRetentionJobId = (data: AgentModerationRetentionContinuationData): string =>
  `agent-moderation-retention__${data.runId}__${data.step}`

const enqueueBulkAgentModerationRetention = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: 'continueAgentModerationRetentionCleanup',
  buildJob: (data: AgentModerationRetentionContinuationData) => ({
    data: data satisfies PsqlJobPayloads['continueAgentModerationRetentionCleanup'],
    opts: {
      jobId: agentModerationRetentionJobId(data),
      priority: PRIORITY_DEFAULT,
      ordering: DATA_RETENTION_ORDERING,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  }),
})

export function enqueueAgentModerationRetentionContinuation(
  data: AgentModerationRetentionContinuationData,
) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: [data],
    jobIdOf: agentModerationRetentionJobId,
    enqueueBulk: enqueueBulkAgentModerationRetention,
  })
}
