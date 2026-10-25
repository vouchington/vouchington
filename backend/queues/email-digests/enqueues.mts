import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import {
  ENGAGEMENT_DISPATCH_ORDERING,
  type EmailDigestInput,
  type ProcessSendCommunityModerationSummaryEmailVariables,
  type ProcessSendFollowNewsSourcesEmailVariables,
  type ProcessSendFollowTopicsEmailVariables,
  type ProcessSendPostReferralLinkEmailVariables,
  type EngagementDispatchData,
  type SendFollowNewsSourcesEmailData,
  type SendFollowTopicsEmailData,
  type SendPostReferralLinkEmailData,
} from '@queues/background/enqueues/email-digests-domain'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ENGAGEMENT_DISPATCH_DEDUP_TTL_MS,
  MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS,
} from './config.mts'

const enqueueFollowTopics = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB)
const enqueuePostReferralLink = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB)
const enqueueFollowNewsSources = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB)
const enqueueFollowTopicsPage = createBackgroundBulkEnqueue(
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  (data: SendFollowTopicsEmailData) => ({ data }),
)
const enqueuePostReferralLinkPage = createBackgroundBulkEnqueue(
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
  (data: SendPostReferralLinkEmailData) => ({ data }),
)
const enqueueFollowNewsSourcesPage = createBackgroundBulkEnqueue(
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  (data: SendFollowNewsSourcesEmailData) => ({ data }),
)
const enqueueModerationSummary = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB)
const enqueueDispatchEngagement = createBackgroundEnqueue(EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB)
const enqueueDispatchModerationSummary = createBackgroundEnqueue(
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
)

export function enqueueSendFollowTopicsEmail(
  input: EmailDigestInput,
  variables: ProcessSendFollowTopicsEmailVariables,
): EnqueueReturnType {
  return enqueueFollowTopics({ input, variables })
}

export async function enqueuePageFollowTopicsEmail(
  input: EmailDigestInput,
  variables: ProcessSendFollowTopicsEmailVariables,
  jobId: string,
) {
  return enqueueFollowTopicsPage([{ input, variables }], { jobId })
}

export function enqueueSendPostReferralLinkEmail(
  input: EmailDigestInput,
  variables: ProcessSendPostReferralLinkEmailVariables,
): EnqueueReturnType {
  return enqueuePostReferralLink({ input, variables })
}

export async function enqueuePagePostReferralLinkEmail(
  input: EmailDigestInput,
  variables: ProcessSendPostReferralLinkEmailVariables,
  jobId: string,
) {
  return enqueuePostReferralLinkPage([{ input, variables }], { jobId })
}

export function enqueueSendFollowNewsSourcesEmail(
  input: EmailDigestInput,
  variables: ProcessSendFollowNewsSourcesEmailVariables,
): EnqueueReturnType {
  return enqueueFollowNewsSources({ input, variables })
}

export async function enqueuePageFollowNewsSourcesEmail(
  input: EmailDigestInput,
  variables: ProcessSendFollowNewsSourcesEmailVariables,
  jobId: string,
) {
  return enqueueFollowNewsSourcesPage([{ input, variables }], { jobId })
}

export function enqueueSendCommunityModerationSummaryEmail(
  input: EmailDigestInput,
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): EnqueueReturnType {
  return enqueueModerationSummary({ input, variables })
}

export function enqueueDispatchEngagementEmails(): EnqueueReturnType {
  return enqueueEngagementDispatchContinuation(
    {},
    {
      deduplication: {
        id: 'email-digests:dispatch-engagement',
        mode: 'throttle',
        ttl: ENGAGEMENT_DISPATCH_DEDUP_TTL_MS,
      },
    },
  )
}

/** Every manual and continuation admission uses the same dispatcher singleton. */
export function enqueueEngagementDispatchContinuation(
  data: EngagementDispatchData,
  options: Partial<JobOptions> = {},
): EnqueueReturnType {
  return enqueueDispatchEngagement(data, { ...options, ordering: ENGAGEMENT_DISPATCH_ORDERING })
}

export function enqueueDispatchCommunityModerationSummaryEmails(): EnqueueReturnType {
  return enqueueDispatchModerationSummary(
    {},
    {
      deduplication: {
        id: 'email-digests:dispatch-moderation-summary',
        mode: 'throttle',
        ttl: MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS,
      },
    },
  )
}
