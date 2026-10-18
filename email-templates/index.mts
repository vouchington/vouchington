import TemplateCommunityApplicationDecision from './community-application-decision.tsx'
import TemplateCommunityInvite from './community-invite.tsx'
import TemplateCommunityModerationSummary from './community-moderation-summary.tsx'
import TemplateCommunityOwnershipTransfer from './community-ownership-transfer.tsx'
import TemplateCommunityRoleChange from './community-role-change.tsx'
import TemplateDataExportReady from './data-export-ready.tsx'
import TemplateEmailVerification from './email-verification.tsx'
import TemplateFollowNewsSources from './follow-news-sources.tsx'
import TemplateFollowTopics from './follow-topics.tsx'
import TemplateLoginToken from './login-token.tsx'
import TemplatePostReferralLink from './post-referral-link.tsx'
import TemplateRenewalPriceIncrease from './renewal-price-increase.tsx'
import TemplateWelcome from './welcome.tsx'
import TemplateApiKeyExpiry from './api-key-expiry.tsx'

export const renderCommunityApplicationDecisionEmail = TemplateCommunityApplicationDecision.render
export const renderCommunityInviteEmail = TemplateCommunityInvite.render
export const renderCommunityModerationSummaryEmail = TemplateCommunityModerationSummary.render
export const renderCommunityOwnershipTransferEmail = TemplateCommunityOwnershipTransfer.render
export const renderCommunityRoleChangeEmail = TemplateCommunityRoleChange.render
export const renderDataExportReadyEmail = TemplateDataExportReady.render
export const renderEmailVerificationEmail = TemplateEmailVerification.render
export const renderFollowNewsSourcesEmail = TemplateFollowNewsSources.render
export const renderFollowTopicsEmail = TemplateFollowTopics.render
export const renderLoginTokenEmail = TemplateLoginToken.render
export const renderPostReferralLinkEmail = TemplatePostReferralLink.render
export const renderRenewalPriceIncreaseEmail = TemplateRenewalPriceIncrease.render
export const renderWelcomeEmail = TemplateWelcome.render
export const renderApiKeyExpiryEmail = TemplateApiKeyExpiry.render

export type {
  CommunityApplicationDecisionEmailProps,
  CommunityInviteEmailProps,
  CommunityModerationSummaryEmailProps,
  CommunityOwnershipTransferEmailProps,
  CommunityRoleChangeEmailProps,
  DataExportReadyEmailProps,
  EmailVerificationEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  LoginTokenEmailProps,
  PostReferralLinkEmailProps,
  RenewalPriceIncreaseEmailProps,
  WelcomeEmailProps,
} from './types.mts'
