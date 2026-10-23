import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { defineBackgroundJob } from './define-job.mts'
import {
  EMAIL_DIGESTS_DOMAIN as DOMAIN,
  type DispatchApiKeyExpiryRemindersData,
  type EmptyEmailDigestsJobData as EmptyData,
  type EngagementDispatchData,
  type SendApiKeyExpiryReminderData,
  type SendCommunityModerationSummaryEmailData,
  type SendFollowNewsSourcesEmailData,
  type SendFollowTopicsEmailData,
  type SendPostReferralLinkEmailData,
} from './email-digests-domain.mts'

const BACKOFF = { type: 'exponential', delay: 1000, jitter: 0.5 } as const
const RETRY = { attempts: 3, backoff: BACKOFF, removeOnComplete: 100, removeOnFail: 100 } as const
// Dispatchers keep the lowest priority tier, though this existing domain lane uses group FIFO.
const TASK = { priority: PRIORITY_TASK } as const
const DISPATCH = { priority: PRIORITY_DISPATCH, ...RETRY } as const

export const EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB = defineBackgroundJob<EngagementDispatchData>(
  DOMAIN,
  {
    name: 'dispatchEngagementEmails',
    ...DISPATCH,
    ...pagedDispatchJobOptions('engagement'),
    sensitive: true,
  },
)
export const EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB = defineBackgroundJob<EmptyData>(
  DOMAIN,
  { name: 'dispatchCommunityModerationSummaryEmails', ...DISPATCH },
)
export const EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB =
  defineBackgroundJob<DispatchApiKeyExpiryRemindersData>(DOMAIN, {
    name: 'dispatchApiKeyExpiryReminders',
    ...DISPATCH,
  })
export const EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB = defineBackgroundJob<SendFollowTopicsEmailData>(
  DOMAIN,
  { name: 'processSendFollowTopicsEmail', ...TASK, sensitive: true },
)
export const EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB =
  defineBackgroundJob<SendPostReferralLinkEmailData>(DOMAIN, {
    name: 'processSendPostReferralLinkEmail',
    ...TASK,
    sensitive: true,
  })
export const EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB =
  defineBackgroundJob<SendFollowNewsSourcesEmailData>(DOMAIN, {
    name: 'processSendFollowNewsSourcesEmail',
    ...TASK,
    sensitive: true,
  })
export const EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB =
  defineBackgroundJob<SendCommunityModerationSummaryEmailData>(DOMAIN, {
    name: 'processSendCommunityModerationSummaryEmail',
    ...TASK,
    sensitive: true,
  })
export const EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB =
  defineBackgroundJob<SendApiKeyExpiryReminderData>(DOMAIN, {
    name: 'processSendApiKeyExpiryReminder',
    ...TASK,
    ...RETRY,
  })

export const EMAIL_DIGESTS_JOBS = [
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
] as const
