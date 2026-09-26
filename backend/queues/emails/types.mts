import type {
  CommunityApplicationDecisionEmailProps,
  CommunityModerationSummaryEmailProps,
  CommunityOwnershipTransferEmailProps,
  CommunityRoleChangeEmailProps,
  DataExportReadyEmailProps,
  EmailVerificationEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
  WelcomeEmailProps,
} from '@email-templates/core'

export type EmailRecipient =
  | { emailAddress: string; userId?: never }
  | { userId: string; emailAddress?: never }

type EmailInputMetadata = {
  trackingKey?: string
  windowStart?: string
  windowEnd?: string
  uiLocale?: string | null
  subject?: string
  text?: string
  html?: string
}

export type EmailJobInput = EmailRecipient & EmailInputMetadata

export type EmailTemplateInput = EmailInputMetadata & {
  emailAddress?: string
  userId?: string
}

export type ProcessSendCommunityInviteEmailVariables = {
  communityName: string
  inviterName: string
  code: string
  uiLocale?: string | null
}

export type ProcessSendEmailAddressLoginTokenVariables = {
  token: string
  expiration: string
  uiLocale?: string | null
}

export type ProcessSendDataExportReadyEmailVariables = DataExportReadyEmailProps

export type ProcessSendEmailVerificationTokenVariables = EmailVerificationEmailProps

// Legacy queue payloads enqueued before physicalAddress became a required
// render prop may still be in-flight when new worker code deploys — queue
// payloads are a trust boundary, so the field is optional here and backfilled
// by the processor. See follow-topics.mts, post-referral-link.mts, and
// follow-news-sources.mts.
export type ProcessSendFollowTopicsEmailVariables = Omit<
  FollowTopicsEmailProps,
  'physicalAddress'
> & {
  physicalAddress?: string
}

export type ProcessSendPostReferralLinkEmailVariables = Omit<
  PostReferralLinkEmailProps,
  'physicalAddress'
> & {
  physicalAddress?: string
}

export type ProcessSendFollowNewsSourcesEmailVariables = Omit<
  FollowNewsSourcesEmailProps,
  'physicalAddress'
> & {
  physicalAddress?: string
}

// Legacy queue payloads enqueued before unsubscribeUrl/physicalAddress became
// required render props may still be in-flight when new worker code deploys —
// queue payloads are a trust boundary, so these two fields are optional here
// and backfilled by the processor. See community-moderation-summary.mts.
export type ProcessSendCommunityModerationSummaryEmailVariables = Omit<
  CommunityModerationSummaryEmailProps,
  'unsubscribeUrl' | 'physicalAddress'
> & {
  unsubscribeUrl?: string
  physicalAddress?: string
}

export type ProcessSendWelcomeEmailVariables = WelcomeEmailProps
export type ProcessSendCopyrightNoticeEmailVariables =
  | { intentId: string; intakeResponseId?: never }
  | { intakeResponseId: string; intentId?: never }

export type ProcessSendCommunityApplicationDecisionEmailVariables =
  CommunityApplicationDecisionEmailProps

export type ProcessSendCommunityRoleChangeEmailVariables = CommunityRoleChangeEmailProps

export type ProcessSendCommunityOwnershipTransferEmailVariables =
  CommunityOwnershipTransferEmailProps

export type EmailSendJobs =
  | 'processSendCommunityInviteEmail'
  | 'processSendEmailAddressLoginToken'
  | 'processSendDataExportReadyEmail'
  | 'processSendEmailVerificationToken'
  | 'processSendFollowTopicsEmail'
  | 'processSendPostReferralLinkEmail'
  | 'processSendFollowNewsSourcesEmail'
  | 'processSendCommunityModerationSummaryEmail'
  | 'processSendWelcomeEmail'
  | 'processSendCommunityApplicationDecisionEmail'
  | 'processSendCommunityRoleChangeEmail'
  | 'processSendCommunityOwnershipTransferEmail'
  | 'processSendCopyrightNoticeEmail'

export type EmailDispatcherJobs =
  | 'dispatchEngagementEmails'
  | 'dispatchCommunityModerationSummaryEmails'

export type EmailJobs = EmailSendJobs | EmailDispatcherJobs

export type EmailJobsTemplates = Record<
  Exclude<EmailSendJobs, 'processSendCopyrightNoticeEmail'>,
  (...args: any[]) => Promise<unknown>
>
