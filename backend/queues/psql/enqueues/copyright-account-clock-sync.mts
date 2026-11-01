import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME,
  copyrightAccountClockSyncJobId,
  getCopyrightAccountClockSyncJobOptions,
  QUEUE_NAME,
} from '../config.mts'
import { psql } from '../queues.mts'
import type { CopyrightAccountClockSyncJobData } from '../types.mts'

const enqueueBulk = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME,
  sensitive: true,
  buildJob: (data: CopyrightAccountClockSyncJobData) => ({
    data,
    opts: getCopyrightAccountClockSyncJobOptions(data.accountUserId),
  }),
})

/** Daily admission recovers a lost enqueue or a retained finished native record. */
export function enqueueCopyrightAccountClockSyncBatch(accountUserIds: readonly string[]) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: accountUserIds.map(accountUserId => ({
      accountUserId,
      afterNoticeId: null,
      sourceVersion: null,
    })),
    jobIdOf: data => copyrightAccountClockSyncJobId(data.accountUserId),
    enqueueBulk,
  })
}
