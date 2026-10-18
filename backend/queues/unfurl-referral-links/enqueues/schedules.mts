import type { JobOptions } from 'glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { PRIORITY_DISPATCHER } from '../config.mts'
import { enqueueUnfurlReferralLinksDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  {
    schedulerId: 'crawl:unfurl-referral-links-dispatcher',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: 'crawl.enqueueUnfurlReferralLinksDispatcher',
      data: {},
      opts: {
        ...requireBackgroundCpuJob('crawl.enqueueUnfurlReferralLinksDispatcher').options,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'crawl:unfurl-referral-links-dispatcher',
        schedule: '0 * * * *',
        description: 'Self-heal requested-but-not-completed Amex referral link unfurls (hourly)',
        trigger: enqueueUnfurlReferralLinksDispatcher,
      },
    ],
  },
])
