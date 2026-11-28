import type { ModerationSummaryCollection } from './moderation-summary-state.mts'
export type {
  ModerationSummaryCollection,
  ModerationSummaryRankedCommunity,
} from './moderation-summary-state.mts'
import type {
  CommunityModerationSummaryEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
} from '@email-templates/core'
import { defineBackgroundDomain } from './define-job.mts'

// Digest dispatch and send jobs share a globally bounded lane. Event-triggered sends use the
// separate `emails` queue and never wait behind a digest backlog.
export const EMAIL_DIGESTS_DOMAIN = defineBackgroundDomain({
  domain: 'email-digests',
  deferral: 'job',
  workerConcurrency: 5,
})

export type EmptyEmailDigestsJobData = Record<string, never>
export type DispatchCommunityModerationSummaryData = { afterId?: string }
/** The opaque `afterId` cursor encodes the last page's expiry timestamp and key ID. */
export type DispatchApiKeyExpiryRemindersData = { afterId?: string }
export type SendApiKeyExpiryReminderData = { apiKeyId: string }

export type EmailDigestRecipient =
  | { emailAddress: string; userId?: never }
  | { userId: string; emailAddress?: never }

/** The recipient plus the optional metadata a digest email carries. */
export type EmailDigestInput = EmailDigestRecipient & {
  trackingKey?: string
  windowStart?: string
  windowEnd?: string
  uiLocale?: string | null
  subject?: string
  text?: string
  html?: string
}

export type ProcessSendFollowTopicsEmailVariables = FollowTopicsEmailProps
export type ProcessSendPostReferralLinkEmailVariables = PostReferralLinkEmailProps
export type ProcessSendFollowNewsSourcesEmailVariables = FollowNewsSourcesEmailProps

export type ProcessSendCommunityModerationSummaryEmailVariables =
  CommunityModerationSummaryEmailProps & {
    dispatchTimeZone: string
    collection: ModerationSummaryCollection
  }

/** A digest email rendered at send time: the recipient plus the template's own variables. */
export type EmailDigestSendData<TVariables> = { input: EmailDigestInput; variables: TVariables }
export type SendFollowTopicsEmailData = EmailDigestSendData<ProcessSendFollowTopicsEmailVariables>
export type SendPostReferralLinkEmailData =
  EmailDigestSendData<ProcessSendPostReferralLinkEmailVariables>
export type SendFollowNewsSourcesEmailData =
  EmailDigestSendData<ProcessSendFollowNewsSourcesEmailVariables>
export type SendCommunityModerationSummaryEmailData = {
  input: Extract<EmailDigestInput, { userId: string }> & {
    trackingKey: string
    windowStart: string
    windowEnd: string
  }
  variables: ProcessSendCommunityModerationSummaryEmailVariables
}
