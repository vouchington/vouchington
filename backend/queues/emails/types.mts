import type {
  CommunityApplicationDecisionEmailProps,
  CommunityOwnershipTransferEmailProps,
  CommunityRoleChangeEmailProps,
  EmailVerificationEmailProps,
  ReauthenticationEmailProps,
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

/** The processor signs a fresh download URL from the durable export row. */
export type ProcessSendDataExportReadyEmailVariables = {
  requestId: string
}

export type ProcessSendReauthenticationTokenVariables = ReauthenticationEmailProps

export type ProcessSendEmailVerificationTokenVariables = EmailVerificationEmailProps

export type ProcessSendWelcomeEmailVariables = WelcomeEmailProps
export type ProcessSendCopyrightNoticeEmailVariables = { intentId: string }

export type ProcessSendCommunityApplicationDecisionEmailVariables =
  CommunityApplicationDecisionEmailProps

export type ProcessSendCommunityRoleChangeEmailVariables = CommunityRoleChangeEmailProps

export type ProcessSendCommunityOwnershipTransferEmailVariables =
  CommunityOwnershipTransferEmailProps

/** Event-triggered sends in the `emails` queue: a person's action enqueues each one directly. */
export type EmailSendJobs =
  | 'processSendCommunityInviteEmail'
  | 'processSendEmailAddressLoginToken'
  | 'processSendDataExportReadyEmail'
  | 'processSendEmailVerificationToken'
  | 'processSendReauthenticationToken'
  | 'processSendWelcomeEmail'
  | 'processSendCommunityApplicationDecisionEmail'
  | 'processSendCommunityRoleChangeEmail'
  | 'processSendCommunityOwnershipTransferEmail'
  | 'processSendCopyrightNoticeEmail'

/** Sends a dispatcher fans out in the `email-digests` domain of the `background` queue. */
export type EmailDigestSendJobs =
  | 'processSendFollowTopicsEmail'
  | 'processSendPostReferralLinkEmail'
  | 'processSendFollowNewsSourcesEmail'
  | 'processSendCommunityModerationSummaryEmail'
  | 'processSendApiKeyExpiryReminder'

export type EmailDigestDispatcherJobs =
  | 'dispatchEngagementEmails'
  | 'dispatchCommunityModerationSummaryEmails'
  | 'dispatchApiKeyExpiryReminders'

export type EmailJobs = EmailSendJobs

type EmailTemplateVariables = {
  processSendCommunityInviteEmail: ProcessSendCommunityInviteEmailVariables
  processSendEmailAddressLoginToken: ProcessSendEmailAddressLoginTokenVariables
  processSendDataExportReadyEmail: ProcessSendDataExportReadyEmailVariables
  processSendEmailVerificationToken: ProcessSendEmailVerificationTokenVariables
  processSendReauthenticationToken: ProcessSendReauthenticationTokenVariables
  processSendWelcomeEmail: ProcessSendWelcomeEmailVariables
  processSendCommunityApplicationDecisionEmail: ProcessSendCommunityApplicationDecisionEmailVariables
  processSendCommunityRoleChangeEmail: ProcessSendCommunityRoleChangeEmailVariables
  processSendCommunityOwnershipTransferEmail: ProcessSendCommunityOwnershipTransferEmailVariables
}

export type EmailJobsTemplates = {
  [JobName in Exclude<EmailSendJobs, 'processSendCopyrightNoticeEmail'>]: (
    input: EmailTemplateInput,
    variables: EmailTemplateVariables[JobName],
  ) => Promise<unknown>
}
