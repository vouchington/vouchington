import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { RSS_FEEDS_DISPATCH_JOB } from '@queues/background/enqueues/rss-feeds-jobs'
import { RSS_FEEDS_ORDERING } from '../config.mts'
import { enqueueDispatchRssFeeds } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'dispatchRssFeeds',
    repeat: { pattern: '* * * * *' },
    template: {
      name: RSS_FEEDS_DISPATCH_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...RSS_FEEDS_DISPATCH_JOB.options,
        ordering: RSS_FEEDS_ORDERING.dispatcher,
      }),
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
