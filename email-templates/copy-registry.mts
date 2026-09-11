import { applicationDecisionCopyByLocale } from './community-application-decision.tsx'
import { communityInviteCopyByLocale } from './community-invite.tsx'
import { communityModerationSummaryCopyByLocale } from './community-moderation-summary-copy.mts'
import { ownershipTransferCopyByLocale } from './community-ownership-transfer.tsx'
import { roleChangeCopyByLocale } from './community-role-change.tsx'
import { dataExportReadyCopyByLocale } from './data-export-ready.tsx'
import { emailVerificationCopyByLocale } from './email-verification.tsx'
import { followNewsSourcesCopyByLocale } from './follow-news-sources-copy.mts'
import { followTopicsCopyByLocale } from './follow-topics-copy.mts'
import { loginTokenCopyByLocale } from './login-token.tsx'
import { postReferralLinkCopyByLocale } from './post-referral-link-copy.mts'
import { supportReplyCopyByLocale } from './support-reply.tsx'
import { copyByLocale as welcomeCopyByLocale } from './welcome-copy.mts'

/**
 * Internal test infrastructure — NOT re-exported from `index.tsx`.
 * Keys every template's `copyByLocale`-shaped object so the parity test
 * (`copy-parity.test.mts`) can walk each one uniformly.
 *
 * `crm-outreach-copy.mts` is intentionally excluded: its body is
 * user-authored CRM content, not part of this parity guarantee.
 * `renewal-price-increase-copy.mts` is intentionally excluded: it exposes
 * a `getRenewalPriceIncreaseContent()` function, not a `copyByLocale` object.
 */
export const emailCopyRegistry = {
  'login-token': loginTokenCopyByLocale,
  'email-verification': emailVerificationCopyByLocale,
  'community-invite': communityInviteCopyByLocale,
  'data-export-ready': dataExportReadyCopyByLocale,
  'support-reply': supportReplyCopyByLocale,
  'community-application-decision': applicationDecisionCopyByLocale,
  'community-role-change': roleChangeCopyByLocale,
  'community-ownership-transfer': ownershipTransferCopyByLocale,
  welcome: welcomeCopyByLocale,
  'community-moderation-summary': communityModerationSummaryCopyByLocale,
  'follow-news-sources': followNewsSourcesCopyByLocale,
  'follow-topics': followTopicsCopyByLocale,
  'post-referral-link': postReferralLinkCopyByLocale,
} as const
