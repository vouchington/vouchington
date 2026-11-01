import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  COPYRIGHT_CASE_PURGE_JOB_NAME,
  copyrightCasePurgeJobId,
  getCopyrightCasePurgeJobOptions,
  QUEUE_NAME,
} from '../config.mts'
import { psql } from '../queues.mts'
import type { CopyrightCasePurgeJobData } from '../types.mts'

const enqueueBulk = createBulkEnqueueFunction({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: COPYRIGHT_CASE_PURGE_JOB_NAME,
  sensitive: true,
  buildJob: (data: CopyrightCasePurgeJobData) => ({
    data,
    opts: getCopyrightCasePurgeJobOptions(data.noticeId),
  }),
})

/** Daily recovery releases only finished native records. Active pages keep one job identity. */
export function enqueueCopyrightCasePurgeBatch(noticeIds: readonly string[]) {
  return enqueueBulkReactivatingFinished({
    queue: psql,
    inputs: noticeIds.map(noticeId => ({
      noticeId,
      phase: 'parties' as const,
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    })),
    jobIdOf: data => copyrightCasePurgeJobId(data.noticeId),
    enqueueBulk,
  })
}
