import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { RssFeedDispatcherJobs } from '../types.mts'
import { rss_feeds } from '../queues.mts'
import {
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  RSS_FEEDS_DEFAULTS,
  RSS_FEEDS_ORDERING,
} from '../config.mts'
import { enqueueDispatchRssFeeds } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'dispatchRssFeeds',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'dispatchRssFeeds' as RssFeedDispatcherJobs,
      data: {},
      opts: {
        attempts: RSS_FEEDS_DEFAULTS.attempts,
        backoff: RSS_FEEDS_DEFAULTS.backoff,
        removeOnComplete: RSS_FEEDS_DEFAULTS.removeOnComplete,
        removeOnFail: RSS_FEEDS_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: RSS_FEEDS_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'dispatchRssFeeds',
        schedule: '* * * * *',
        description: 'Dispatch RSS feed fetching',
        trigger: enqueueDispatchRssFeeds,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(rss_feeds, scheduledJobManifest)
}
