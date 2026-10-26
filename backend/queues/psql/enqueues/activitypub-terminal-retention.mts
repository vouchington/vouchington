import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { psql } from '../queues.mts'
import type { JobOptions } from 'glide-mq'
import {
  getTerminalActivityRetentionConcurrency,
  PRIORITY_DEFAULT,
  PSQL_RETRY_OPTIONS,
  QUEUE_NAME,
  TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
} from '../config.mts'
import type { TerminalActivityRetentionData } from '../types.mts'

export const terminalActivityRetentionJobId = (data: TerminalActivityRetentionData): string =>
  `psql__terminal_activity_retention__${data.family}`

export function getTerminalActivityRetentionJobOptions(
  data: TerminalActivityRetentionData,
): JobOptions {
  return {
    ...PSQL_RETRY_OPTIONS,
    jobId: terminalActivityRetentionJobId(data),
    priority: PRIORITY_DEFAULT,
    ordering: {
      key: `psql:terminal-activity-retention:${data.family}`,
      concurrency: getTerminalActivityRetentionConcurrency(),
    },
  }
}

const enqueueBulk = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
  buildJob: (data: TerminalActivityRetentionData) => ({
    data,
    opts: getTerminalActivityRetentionJobOptions(data),
  }),
})

/** Finished records reactivate; waiting/delayed/active family jobs remain the canonical sweep. */
export function enqueueTerminalActivityRetention(
  families: TerminalActivityRetentionData['family'][],
) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: families.map(family => ({ family })),
    jobIdOf: terminalActivityRetentionJobId,
    enqueueBulk,
  })
}
