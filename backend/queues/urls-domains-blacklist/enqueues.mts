import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
  URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB,
  URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB,
} from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { URLS_DOMAINS_BLACKLIST_ORDERING } from './config.mts'
import type { BlacklistSourceSyncData } from './types.mts'

const enqueueBlacklistDispatcherJob = createBackgroundEnqueue(URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB)

const enqueueSourceSyncJob = createBackgroundEnqueue(URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB)

const enqueueHostnameCacheInvalidationSweepJob = createBackgroundEnqueue(
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
)

const enqueueBulkSourceSyncJobs = createBackgroundBulkEnqueue(
  URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB,
  ({ delayMs, ...data }: BlacklistSourceSyncData & { delayMs: number }) => ({
    data,
    opts: { delay: delayMs },
  }),
)

export const enqueueBlacklistDispatcher = (priority?: number): EnqueueReturnType => {
  return enqueueBlacklistDispatcherJob(
    {},
    {
      ...(priority === undefined ? {} : { priority }),
      ordering: URLS_DOMAINS_BLACKLIST_ORDERING.dispatcher,
    },
  )
}

export const enqueueHostnameCacheInvalidationSweep = (): EnqueueReturnType =>
  enqueueHostnameCacheInvalidationSweepJob(
    {},
    { ordering: URLS_DOMAINS_BLACKLIST_ORDERING.cacheInvalidation },
  )

export const enqueueSourceSync = (
  data: BlacklistSourceSyncData,
  delayMs?: number,
  priority?: number,
): EnqueueReturnType => {
  // NOTE: no BULLMQ_INLINE_MODE support because it makes external HTTP requests
  return enqueueSourceSyncJob(data, {
    ...(priority === undefined ? {} : { priority }),
    delay: delayMs,
  })
}

export const enqueueBulkSourceSyncs = (
  dataList: BlacklistSourceSyncData[],
  priority?: number,
): EnqueueReturnType => {
  if (dataList.length === 0) return Promise.resolve()

  // NOTE: no BULLMQ_INLINE_MODE support because it makes external HTTP requests
  return enqueueBulkSourceSyncJobs(
    dataList.map((data, index) => ({ ...data, delayMs: index * 60 * 60 * 1000 })),
    priority === undefined ? {} : { priority },
  )
}
