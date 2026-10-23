import type {
  CommunityModerationSummaryEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
} from '@email-templates/core'
import { defineBackgroundDomain } from './define-job.mts'

// The old `emails` queue ran its dispatchers and their fan-out under one worker of 5. One
// domain-wide group of 5 keeps that cap on the shared worker, so a digest run cannot send faster
// than it did. Event-triggered sends stay in the separate `emails` queue and never wait behind it.
export const EMAIL_DIGESTS_DOMAIN = defineBackgroundDomain({
  domain: 'email-digests',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

export type EmptyEmailDigestsJobData = Record<string, never>
/** One page of API keys; `afterId` is the last key of the previous page. */
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

// The queue payload is a trust boundary: the render props the processor backfills (the physical
// address and, for the moderation summary, the unsubscribe link) are optional here.
export type ProcessSendFollowTopicsEmailVariables = Omit<
  FollowTopicsEmailProps,
  'physicalAddress'
> & { physicalAddress?: string }

export type ProcessSendPostReferralLinkEmailVariables = Omit<
  PostReferralLinkEmailProps,
  'physicalAddress'
> & { physicalAddress?: string }

export type ProcessSendFollowNewsSourcesEmailVariables = Omit<
  FollowNewsSourcesEmailProps,
  'physicalAddress'
> & { physicalAddress?: string }

export type ProcessSendCommunityModerationSummaryEmailVariables = Omit<
  CommunityModerationSummaryEmailProps,
  'unsubscribeUrl' | 'physicalAddress'
> & { unsubscribeUrl?: string; physicalAddress?: string }

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
