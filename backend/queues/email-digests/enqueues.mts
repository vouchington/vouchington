import {
  createModerationSummaryCollection,
  MODERATION_SUMMARY_STAGES,
  type ModerationSummaryNext,
  type ModerationSummaryStage,
} from '@queues/background/enqueues/moderation-summary-state'
import { createHash } from 'node:crypto'
import { getBackgroundOrderingConcurrency } from '@queues/background/config'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS,
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
  SendCommunityModerationSummaryEmailData,
} from '@queues/background/enqueues/email-digests-domain'
import type { EnqueueReturnType } from '@voucha/types'
import {
  ENGAGEMENT_DISPATCH_DEDUP_TTL_MS,
  MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS,
} from './config.mts'

const enqueueFollowTopics = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB)
const enqueuePostReferralLink = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB)
const enqueueFollowNewsSources = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB)
const enqueueModerationSummary = createBackgroundEnqueue(EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB)
const enqueueModerationSummaryStage = Object.fromEntries(
  MODERATION_SUMMARY_STAGES.map(stage => [
    stage,
    createBackgroundEnqueue(EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS[stage]),
  ]),
) as Record<ModerationSummaryStage, typeof enqueueModerationSummary>
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

/** Starts a digest collection at its first stage, memberships. */
export function enqueueSendCommunityModerationSummaryEmail(
  input: SendCommunityModerationSummaryEmailData['input'],
  variables: Omit<ProcessSendCommunityModerationSummaryEmailVariables, 'collection'>,
): EnqueueReturnType {
  const collection = createModerationSummaryCollection()
  return enqueueModerationSummaryStep('memberships', input, {
    ...variables,
    communities: [],
    collection,
  })
}

/**
 * Admits the job that runs after a finished stage. The id is the stage plus its cursor, so a
 * retried stage re-admits the same next job instead of a second one.
 */
export function enqueueModerationSummaryStep(
  next: ModerationSummaryNext,
  input: SendCommunityModerationSummaryEmailData['input'],
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): EnqueueReturnType {
  const cursor = variables.collection
  const identity = createHash('sha256')
    .update(
      JSON.stringify([
        next,
        input.userId,
        input.trackingKey,
        cursor.eventId,
        cursor.afterMembershipId,
        cursor.discussionCommunityIndex,
        cursor.scan && [
          cursor.scan.communityId,
          cursor.scan.afterId,
          cursor.scan.parentId,
          cursor.scan.afterChildId,
          cursor.scan.sourceUpperId,
          cursor.scan.childUpperId,
        ],
      ]),
    )
    .digest('hex')
  return (next === 'send' ? enqueueModerationSummary : enqueueModerationSummaryStage[next])(
    { input, variables },
    {
      jobId: `moderation-summary-${identity}`,
      ordering: {
        key: `email-digests:moderation-summary:${input.userId}`,
        concurrency: getBackgroundOrderingConcurrency('email-digests:moderation-summary'),
      },
    },
  )
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

/** afterId encodes the last inspected (user, community) membership, not just a user. */
export function enqueueDispatchCommunityModerationSummaryEmails(
  data: { afterId?: string } = {},
): EnqueueReturnType {
  return enqueueDispatchModerationSummary(data, {
    deduplication: {
      id: `email-digests:dispatch-moderation-summary:${data.afterId ?? 'root'}`,
      mode: 'throttle',
      ttl: MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS,
    },
  })
}
