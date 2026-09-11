import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  KAGI_SMALLWEB_DEFAULTS,
  KAGI_SMALLWEB_ORDERING,
  KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from './config.mts'
import { kagiSmallWeb } from './queues.mts'
import type {
  KagiFeedJobData,
  KagiSmallWebDispatcherJobs,
  KagiSmallWebProcessJobs,
} from './types.mts'

const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

const enqueueKagiSmallWebSyncJob = createEnqueueFunction<
  Record<string, never>,
  KagiSmallWebDispatcherJobs
>({
  queue: kagiSmallWeb,
  queueName: QUEUE_NAME,
  jobName: 'sync',
  defaults: KAGI_SMALLWEB_DEFAULTS,
})

const enqueueBulkProcessKagiFeedsJob = createBulkEnqueueFunction<
  KagiFeedJobData,
  KagiFeedJobData,
  KagiSmallWebProcessJobs
>({
  queue: kagiSmallWeb,
  queueName: QUEUE_NAME,
  jobName: 'processFeed',
  defaults: KAGI_SMALLWEB_DEFAULTS,
  buildJob: entry => ({
    data: entry,
    opts: {
      priority: PRIORITY_DEFAULT,
      ordering: KAGI_SMALLWEB_ORDERING.process,
      deduplication: {
        id: `kagi_process_feed__${entry.feedUrl}`,
        mode: 'throttle' as const,
        ttl: KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS,
      },
    } satisfies Partial<JobOptions>,
  }),
})

type KagiSmallWebSyncOptions = {
  deduplicationId?: string
}

export function enqueueKagiSmallWebSync(options?: KagiSmallWebSyncOptions): EnqueueReturnType {
  return enqueueKagiSmallWebSyncJob({}, {
    priority: PRIORITY_DISPATCHER,
    ordering: KAGI_SMALLWEB_ORDERING.dispatcher,
    ...(options?.deduplicationId && {
      deduplication: {
        id: options.deduplicationId,
        mode: 'throttle' as const,
        ttl: BACKFILL_DEDUPLICATION_TTL_MS,
      },
    }),
  } satisfies Partial<JobOptions>)
}

export function enqueueBulkProcessKagiFeeds(entries: KagiFeedJobData[]): EnqueueReturnType {
  return enqueueBulkProcessKagiFeedsJob(entries, { priority: PRIORITY_DEFAULT })
}
