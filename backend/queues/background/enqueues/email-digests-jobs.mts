import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import {
  EMAIL_DIGESTS_DOMAIN as DOMAIN,
  type DispatchApiKeyExpiryRemindersData,
  type DispatchCommunityModerationSummaryData,
  type EmptyEmailDigestsJobData as EmptyData,
  type SendApiKeyExpiryReminderData,
  type SendCommunityModerationSummaryEmailData,
  type SendFollowNewsSourcesEmailData,
  type SendFollowTopicsEmailData,
  type SendPostReferralLinkEmailData,
} from './email-digests-domain.mts'
import {
  MODERATION_SUMMARY_STAGES,
  moderationSummaryStageJobName,
  type ModerationSummaryStage,
} from './moderation-summary-state.mts'

const BACKOFF = { type: 'exponential', delay: 1000, jitter: 0.5 } as const
const RETRY = { attempts: 3, backoff: BACKOFF, removeOnComplete: 100, removeOnFail: 100 } as const
// Dispatchers keep the lowest priority tier, though this existing domain lane uses group FIFO.
const TASK = { priority: PRIORITY_TASK } as const
const DISPATCH = { priority: PRIORITY_DISPATCH, ...RETRY } as const

export const EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB = defineBackgroundJob<EmptyData>(DOMAIN, {
  name: 'dispatchEngagementEmails',
  ...DISPATCH,
})
export const EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB =
  defineBackgroundJob<DispatchCommunityModerationSummaryData>(DOMAIN, {
    name: 'dispatchCommunityModerationSummaryEmails',
    ...DISPATCH,
  })
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
    ordering: { key: 'email-digests:moderation-summary', concurrency: 1 },
    sensitive: true,
  })
/** One job per collection stage; each walks only its own cursor and enqueues the next stage. */
export const EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS = Object.fromEntries(
  MODERATION_SUMMARY_STAGES.map(stage => [stage, defineModerationSummaryStageJob(stage)]),
) as Record<ModerationSummaryStage, ReturnType<typeof defineModerationSummaryStageJob>>
function defineModerationSummaryStageJob(stage: ModerationSummaryStage) {
  return defineBackgroundJob<SendCommunityModerationSummaryEmailData>(DOMAIN, {
    name: moderationSummaryStageJobName(stage),
    ...TASK,
    ordering: { key: 'email-digests:moderation-summary', concurrency: 1 },
    sensitive: true,
  })
}
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
  ...MODERATION_SUMMARY_STAGES.map(stage => EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS[stage]),
  EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
] as const
