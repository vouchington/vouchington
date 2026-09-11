import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { UnfurlReferralLinksJobs } from '../types.mts'
import { unfurlReferralLinksQueue } from '../queues.mts'
import {
  PRIORITY_DISPATCHER,
  UNFURL_REFERRAL_LINKS_DEFAULTS,
  UNFURL_REFERRAL_LINKS_ORDERING,
  UNFURL_REFERRAL_LINKS_QUEUE_NAME,
} from '../config.mts'
import { enqueueUnfurlReferralLinksDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(UNFURL_REFERRAL_LINKS_QUEUE_NAME, [
  {
    schedulerId: 'unfurl_referral_links_dispatcher',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: 'unfurl_referral_links_dispatcher' as UnfurlReferralLinksJobs,
      data: {},
      opts: {
        attempts: UNFURL_REFERRAL_LINKS_DEFAULTS.attempts,
        backoff: UNFURL_REFERRAL_LINKS_DEFAULTS.backoff,
        removeOnComplete: UNFURL_REFERRAL_LINKS_DEFAULTS.removeOnComplete,
        removeOnFail: UNFURL_REFERRAL_LINKS_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: UNFURL_REFERRAL_LINKS_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'unfurl_referral_links_dispatcher',
        schedule: '0 * * * *',
        description: 'Self-heal requested-but-not-completed Amex referral link unfurls (hourly)',
        trigger: enqueueUnfurlReferralLinksDispatcher,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(unfurlReferralLinksQueue, scheduledJobManifest)
}
