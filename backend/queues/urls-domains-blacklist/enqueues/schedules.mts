import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
  URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB,
} from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import { URLS_DOMAINS_BLACKLIST_ORDERING } from '../config.mts'
import { enqueueBlacklistDispatcher, enqueueHostnameCacheInvalidationSweep } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'hostnameCacheInvalidationSweep',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB.options,
        ordering: URLS_DOMAINS_BLACKLIST_ORDERING.cacheInvalidation,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'hostnameCacheInvalidationSweep',
        schedule: '*/5 * * * *',
        description: 'Drain durable hostname-policy cache invalidations',
        trigger: enqueueHostnameCacheInvalidationSweep,
      },
    ],
  },
  {
    schedulerId: 'blacklistDispatcher',
    repeat: { pattern: '0 2 * * 0' },
    template: {
      name: URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB.options,
        ordering: URLS_DOMAINS_BLACKLIST_ORDERING.dispatcher,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'blacklistDispatcher',
        schedule: '0 2 * * 0',
        description: 'Dispatch URL/domain blacklist syncing (weekly)',
        trigger: enqueueBlacklistDispatcher,
      },
    ],
  },
])
