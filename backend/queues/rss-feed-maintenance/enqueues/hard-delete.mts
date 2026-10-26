import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, PRIORITY_RECOVERY, QUEUE_NAME } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { RssFeedHardDeleteChildPhase } from '../types.mts'

const enqueueSourcePageJob = createEnqueueFunction<
  { rssFeedId: string },
  'processHardDeleteRssFeedSourcePage'
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processHardDeleteRssFeedSourcePage',
})

const enqueueChildPageJob = createEnqueueFunction<
  { rssFeedId: string; phase: RssFeedHardDeleteChildPhase },
  'processHardDeleteRssFeedChildPage'
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processHardDeleteRssFeedChildPage',
})

const enqueueFinalizerJob = createEnqueueFunction<
  { rssFeedId: string },
  'processFinalizeHardDeleteRssFeed'
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processFinalizeHardDeleteRssFeed',
})

const enqueueRecoveryPageJob = createEnqueueFunction<
  { afterId: string | null },
  'processRecoverRssFeedHardDeletes'
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processRecoverRssFeedHardDeletes',
})

/** Multiple admissions are harmless: the feed lock and committed domain marker serialize pages. */
export function enqueueHardDeleteRssFeedSourcePage(rssFeedId: string): EnqueueReturnType {
  return enqueueSourcePageJob(
    { rssFeedId },
    {
      priority: PRIORITY_DEFAULT,
      ordering: { key: `hard-delete-rss-feed:${rssFeedId}`, concurrency: 1 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
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

export function enqueueHardDeleteRssFeedChildPage(
  rssFeedId: string,
  phase: RssFeedHardDeleteChildPhase,
): EnqueueReturnType {
  return enqueueChildPageJob(
    { rssFeedId, phase },
    {
      priority: PRIORITY_DEFAULT,
      ordering: { key: `hard-delete-rss-feed:${rssFeedId}`, concurrency: 1 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}

export function enqueueFinalizeHardDeleteRssFeed(rssFeedId: string): EnqueueReturnType {
  return enqueueFinalizerJob(
    { rssFeedId },
    {
      priority: PRIORITY_DEFAULT,
      ordering: { key: `hard-delete-rss-feed:${rssFeedId}`, concurrency: 1 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}
