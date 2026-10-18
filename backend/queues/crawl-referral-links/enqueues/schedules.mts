import type { JobOptions } from 'glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { PRIORITY_DISPATCHER } from '../config.mts'
import { enqueueCrawlReferralLinksDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  {
    schedulerId: 'crawl:referral-links-dispatcher',
    repeat: { pattern: '0 4 * * 0' },
    template: {
      name: 'crawl.crawl_referral_links_dispatcher',
      data: {},
      opts: {
        ...requireBackgroundCpuJob('crawl.crawl_referral_links_dispatcher').options,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'crawl:referral-links-dispatcher',
        schedule: '0 4 * * 0',
        description: 'Dispatch referral link crawling (weekly)',
        trigger: enqueueCrawlReferralLinksDispatcher,
      },
    ],
  },
])
