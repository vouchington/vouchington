import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { emails } from '../queues.mts'
import {
  enqueueDispatchCommunityModerationSummaryEmails,
  enqueueDispatchEngagementEmails,
} from '../enqueues.mts'

const SCHEDULE_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DISPATCHER,
} satisfies JobOptions

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'dispatchEngagementEmails',
    repeat: { pattern: '0 * * * *' },
    template: { name: 'dispatchEngagementEmails', data: {}, opts: { ...SCHEDULE_OPTS } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'dispatchEngagementEmails',
        schedule: '0 * * * *',
        description: 'Dispatch engagement onboarding emails',
        trigger: enqueueDispatchEngagementEmails,
      },
    ],
  },
  {
    schedulerId: 'dispatchCommunityModerationSummaryEmails',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'dispatchCommunityModerationSummaryEmails',
      data: {},
      opts: { ...SCHEDULE_OPTS },
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'dispatchCommunityModerationSummaryEmails',
        schedule: '* * * * *',
        description: 'Dispatch moderation summary emails',
        trigger: enqueueDispatchCommunityModerationSummaryEmails,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(emails, scheduledJobManifest)
}
