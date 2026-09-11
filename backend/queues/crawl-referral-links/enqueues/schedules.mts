import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { CrawlReferralLinksJobs } from '../types.mts'
import { crawlReferralLinksQueue } from '../queues.mts'
import {
  CRAWL_REFERRAL_LINKS_ORDERING,
  CRAWL_REFERRAL_LINKS_DEFAULTS,
  PRIORITY_DISPATCHER,
  CRAWL_REFERRAL_LINKS_QUEUE_NAME,
} from '../config.mts'
import { enqueueCrawlReferralLinksDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(CRAWL_REFERRAL_LINKS_QUEUE_NAME, [
  {
    schedulerId: 'crawl_referral_links_dispatcher',
    repeat: { pattern: '0 4 * * 0' },
    template: {
      name: 'crawl_referral_links_dispatcher' as CrawlReferralLinksJobs,
      data: {},
      opts: {
        attempts: CRAWL_REFERRAL_LINKS_DEFAULTS.attempts,
        backoff: CRAWL_REFERRAL_LINKS_DEFAULTS.backoff,
        removeOnComplete: CRAWL_REFERRAL_LINKS_DEFAULTS.removeOnComplete,
        removeOnFail: CRAWL_REFERRAL_LINKS_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: CRAWL_REFERRAL_LINKS_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'crawl_referral_links_dispatcher',
        schedule: '0 4 * * 0',
        description: 'Dispatch referral link crawling (weekly)',
        trigger: enqueueCrawlReferralLinksDispatcher,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(crawlReferralLinksQueue, scheduledJobManifest)
}
