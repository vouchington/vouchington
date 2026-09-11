import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { ProcessorJobs } from '../types.mts'
import { urlsDomainsBlacklist } from '../queues.mts'
import {
  URLS_DOMAINS_BLACKLIST_ORDERING,
  URLS_DOMAINS_BLACKLIST_DEFAULTS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { enqueueBlacklistDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'blacklistDispatcher',
    repeat: { pattern: '0 2 * * 0' },
    template: {
      name: 'processBlacklistDispatcher' as ProcessorJobs,
      data: {},
      opts: {
        attempts: URLS_DOMAINS_BLACKLIST_DEFAULTS.attempts,
        backoff: URLS_DOMAINS_BLACKLIST_DEFAULTS.backoff,
        removeOnComplete: URLS_DOMAINS_BLACKLIST_DEFAULTS.removeOnComplete,
        removeOnFail: URLS_DOMAINS_BLACKLIST_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: URLS_DOMAINS_BLACKLIST_ORDERING.dispatcher,
      } satisfies JobOptions,
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

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(urlsDomainsBlacklist, scheduledJobManifest)
}
