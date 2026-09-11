import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  URLS_DOMAINS_BLACKLIST_DEFAULTS,
  URLS_DOMAINS_BLACKLIST_ORDERING,
} from './config.mts'
import { urlsDomainsBlacklist } from './queues.mts'
import type { BlacklistDispatcherData, BlacklistSourceSyncData, ProcessorJobs } from './types.mts'

const DISPATCHER_JOB_NAME: ProcessorJobs = 'processBlacklistDispatcher'
const SYNC_JOB_NAME: ProcessorJobs = 'processBlacklistSourceSync'

const defaults = {
  attempts: URLS_DOMAINS_BLACKLIST_DEFAULTS.attempts,
  backoff: URLS_DOMAINS_BLACKLIST_DEFAULTS.backoff,
  removeOnComplete: URLS_DOMAINS_BLACKLIST_DEFAULTS.removeOnComplete,
  removeOnFail: URLS_DOMAINS_BLACKLIST_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueBlacklistDispatcherJob = createEnqueueFunction<BlacklistDispatcherData, ProcessorJobs>(
  {
    queue: urlsDomainsBlacklist,
    queueName: QUEUE_NAME,
    jobName: DISPATCHER_JOB_NAME,
    defaults,
  },
)

const enqueueSourceSyncJob = createEnqueueFunction<BlacklistSourceSyncData, ProcessorJobs>({
  queue: urlsDomainsBlacklist,
  queueName: QUEUE_NAME,
  jobName: SYNC_JOB_NAME,
  defaults,
})

const enqueueBulkSourceSyncJobs = createBulkEnqueueFunction<
  BlacklistSourceSyncData & { delayMs: number },
  BlacklistSourceSyncData,
  ProcessorJobs
>({
  queue: urlsDomainsBlacklist,
  queueName: QUEUE_NAME,
  jobName: SYNC_JOB_NAME,
  defaults,
  buildJob: ({ delayMs, ...data }) => ({
    data,
    opts: {
      delay: delayMs,
      ordering: URLS_DOMAINS_BLACKLIST_ORDERING.sync,
    },
  }),
})

export const enqueueBlacklistDispatcher = (priority?: number): EnqueueReturnType => {
  return enqueueBlacklistDispatcherJob(
    {},
    {
      priority: priority ?? PRIORITY_DISPATCHER,
      ordering: URLS_DOMAINS_BLACKLIST_ORDERING.dispatcher,
    },
  )
}

export const enqueueSourceSync = (
  data: BlacklistSourceSyncData,
  delayMs?: number,
  priority?: number,
): EnqueueReturnType => {
  // NOTE: no BULLMQ_INLINE_MODE support because it makes external HTTP requests
  return enqueueSourceSyncJob(data, {
    priority: priority ?? PRIORITY_DEFAULT,
    delay: delayMs,
    ordering: URLS_DOMAINS_BLACKLIST_ORDERING.sync,
  })
}

export const enqueueBulkSourceSyncs = (
  dataList: BlacklistSourceSyncData[],
  priority?: number,
): EnqueueReturnType => {
  if (dataList.length === 0) return

  // NOTE: no BULLMQ_INLINE_MODE support because it makes external HTTP requests
  return enqueueBulkSourceSyncJobs(
    dataList.map((data, index) => ({ ...data, delayMs: index * 60 * 60 * 1000 })),
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}
