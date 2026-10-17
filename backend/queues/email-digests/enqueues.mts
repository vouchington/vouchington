import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import type {
  EmailDigestInput,
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/background/enqueues/email-digests-domain'
import type { EnqueueReturnType } from '@voucha/types'
import {
  ENGAGEMENT_DISPATCH_DEDUP_TTL_MS,
  MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS,
} from './config.mts'

export {
  enqueueBulkSendApiKeyExpiryReminders,
  enqueueDispatchApiKeyExpiryReminders,
} from './enqueues/api-key-expiry.mts'

const enqueueFollowTopics = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB)
const enqueuePostReferralLink = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB)
const enqueueFollowNewsSources = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB)
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

export function enqueueSendPostReferralLinkEmail(
  input: EmailDigestInput,
  variables: ProcessSendPostReferralLinkEmailVariables,
): EnqueueReturnType {
  return enqueuePostReferralLink({ input, variables })
}

export function enqueueSendFollowNewsSourcesEmail(
  input: EmailDigestInput,
  variables: ProcessSendFollowNewsSourcesEmailVariables,
): EnqueueReturnType {
  return enqueueFollowNewsSources({ input, variables })
}

export function enqueueSendCommunityModerationSummaryEmail(
  input: EmailDigestInput,
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): EnqueueReturnType {
  return enqueueModerationSummary({ input, variables })
}

export function enqueueDispatchEngagementEmails(): EnqueueReturnType {
  return enqueueDispatchEngagement(
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
