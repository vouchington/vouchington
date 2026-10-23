import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import {
  enqueueDispatchCommunityModerationSummaryEmails,
  enqueueDispatchEngagementEmails,
} from '../enqueues.mts'
import { enqueueDispatchApiKeyExpiryReminders } from './api-key-expiry.mts'
import { ENGAGEMENT_DISPATCH_ORDERING } from '../config.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'email-digests-api-key-expiry',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions(EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB.options),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'email-digests-api-key-expiry',
        schedule: '0 * * * *',
        description: 'Dispatch API key expiry reminders',
        trigger: enqueueDispatchApiKeyExpiryReminders,
      },
    ],
  },
  {
    schedulerId: 'email-digests-engagement',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.options,
        ordering: ENGAGEMENT_DISPATCH_ORDERING,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'email-digests-engagement',
        schedule: '0 * * * *',
        description: 'Dispatch engagement onboarding emails',
        trigger: enqueueDispatchEngagementEmails,
      },
    ],
  },
  {
    schedulerId: 'email-digests-moderation-summary',
    repeat: { pattern: '* * * * *' },
    template: {
      name: EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions(EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB.options),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'email-digests-moderation-summary',
        schedule: '* * * * *',
        description: 'Dispatch moderation summary emails',
        trigger: enqueueDispatchCommunityModerationSummaryEmails,
      },
    ],
  },
])
