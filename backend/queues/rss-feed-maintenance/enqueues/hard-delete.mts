import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_HARD_DELETE, PRIORITY_RECOVERY, QUEUE_NAME } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { RssFeedHardDeleteChildPhase, RssFeedHardDeletePageData } from '../types.mts'

const enqueueSourcePages = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processHardDeleteRssFeedSourcePage',
  buildJob: (data: RssFeedHardDeletePageData) => ({
    data,
    opts: deletePageOptions(data, 'sources'),
  }),
})
const enqueueChildPages = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processHardDeleteRssFeedChildPage',
  buildJob: (data: RssFeedHardDeletePageData & { phase: RssFeedHardDeleteChildPhase }) => ({
    data,
    opts: deletePageOptions(data, data.phase),
  }),
})
const enqueueFinalizers = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processFinalizeHardDeleteRssFeed',
  buildJob: (data: RssFeedHardDeletePageData) => ({
    data,
    opts: deletePageOptions(data, 'finalize'),
  }),
})
const enqueueRecoveryPageJob = createEnqueueFunction<
  { afterId: string | null },
  'processRecoverRssFeedHardDeletes'
>({ queue: rssFeedMaintenance, queueName: QUEUE_NAME, jobName: 'processRecoverRssFeedHardDeletes' })

/** A live canonical page wins over recovery; native terminal records can be reactivated. */
export function enqueueHardDeleteRssFeedSourcePages(inputs: RssFeedHardDeletePageData[]) {
  return enqueueBulkReactivatingFinished({
    queue: rssFeedMaintenance,
    inputs,
    jobIdOf: data => deletePageOptions(data, 'sources').jobId,
    enqueueBulk: enqueueSourcePages,
  })
}

export function enqueueRecoverRssFeedHardDeletes(afterId: string | null = null): EnqueueReturnType {
  return enqueueRecoveryPageJob(
    { afterId },
    {
      priority: PRIORITY_RECOVERY,
      ordering: { key: 'hard-delete-rss-feed-recovery', concurrency: 1 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}

export function enqueueHardDeleteRssFeedChildPages(
  inputs: (RssFeedHardDeletePageData & { phase: RssFeedHardDeleteChildPhase })[],
) {
  return enqueueBulkReactivatingFinished({
    queue: rssFeedMaintenance,
    inputs,
    jobIdOf: data => deletePageOptions(data, data.phase).jobId,
    enqueueBulk: enqueueChildPages,
  })
}

export function enqueueHardDeleteRssFeedFinalizers(inputs: RssFeedHardDeletePageData[]) {
  return enqueueBulkReactivatingFinished({
    queue: rssFeedMaintenance,
    inputs,
    jobIdOf: data => deletePageOptions(data, 'finalize').jobId,
    enqueueBulk: enqueueFinalizers,
  })
}

function deletePageOptions(data: RssFeedHardDeletePageData, phase: string) {
  return {
    jobId: rssFeedHardDeletePageJobId(data, phase),
    priority: PRIORITY_HARD_DELETE,
    ordering: { key: `hard-delete-rss-feed:${data.rssFeedId}`, concurrency: 1 },
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
    removeOnComplete: true,
    removeOnFail: true,
  }
}

export function rssFeedHardDeletePageJobId(data: RssFeedHardDeletePageData, phase: string): string {
  return `hard-delete-rss-feed__${data.rssFeedId}__${phase}__${data.pageCursor}`
}
