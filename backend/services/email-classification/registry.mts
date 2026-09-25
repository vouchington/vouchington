import type { EmailSendJobs } from '@queues/emails/types'
import type { EmailUnsubscribeCategory } from '@services/users'

export type EmailType = EmailSendJobs | 'processSendRenewalPriceIncreaseEmail' | 'newsDigest'

type TransactionalEntry = {
  classification: 'transactional'
}

type MarketingEntry = {
  classification: 'marketing'
  unsubscribe: { scheme: 'user-category'; category: EmailUnsubscribeCategory }
  hasActiveSender: boolean
}

export type EmailClassificationEntry = TransactionalEntry | MarketingEntry

export const EMAIL_CLASSIFICATIONS: Record<EmailType, EmailClassificationEntry> = {
  processSendCommunityInviteEmail: { classification: 'transactional' },
  processSendEmailAddressLoginToken: { classification: 'transactional' },
  processSendDataExportReadyEmail: { classification: 'transactional' },
  processSendEmailVerificationToken: { classification: 'transactional' },
  processSendSupportEmail: { classification: 'transactional' },
  processSendWelcomeEmail: { classification: 'transactional' },
  processSendCommunityApplicationDecisionEmail: { classification: 'transactional' },
  processSendCommunityRoleChangeEmail: { classification: 'transactional' },
  processSendCommunityOwnershipTransferEmail: { classification: 'transactional' },
  processSendRenewalPriceIncreaseEmail: { classification: 'transactional' },
  processSendCopyrightNoticeEmail: { classification: 'transactional' },

  processSendFollowTopicsEmail: {
    classification: 'marketing',
    unsubscribe: { scheme: 'user-category', category: 'outcome_emails' },
    hasActiveSender: true,
  },
  processSendPostReferralLinkEmail: {
    classification: 'marketing',
    unsubscribe: { scheme: 'user-category', category: 'outcome_emails' },
    hasActiveSender: true,
  },
  processSendFollowNewsSourcesEmail: {
    classification: 'marketing',
    unsubscribe: { scheme: 'user-category', category: 'outcome_emails' },
    hasActiveSender: true,
  },
  processSendCommunityModerationSummaryEmail: {
    classification: 'marketing',
    unsubscribe: { scheme: 'user-category', category: 'community_digest' },
    hasActiveSender: true,
  },
  // Registry-only: no sender exists yet. Tracked by #1167/#1351.
  newsDigest: {
    classification: 'marketing',
    unsubscribe: { scheme: 'user-category', category: 'news_digest' },
    hasActiveSender: false,
  },
}
