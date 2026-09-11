import type {
  CommunityApplicationDecisionEmailProps,
  CommunityInviteEmailProps,
  CommunityModerationSummaryEmailProps,
  CommunityOwnershipTransferEmailProps,
  CommunityRoleChangeEmailProps,
  CrmOutreachEmailProps,
  DataExportReadyEmailProps,
  EmailRenderResult,
  EmailRenderResultPromise,
  EmailVerificationEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  LoginTokenEmailProps,
  PostReferralLinkEmailProps,
  RenewalPriceIncreaseEmailProps,
  SupportReplyEmailProps,
  WelcomeEmailProps,
} from './types.mts'

export type {
  CommunityApplicationDecisionEmailProps,
  CommunityInviteEmailProps,
  CommunityModerationSummaryEmailProps,
  CommunityOwnershipTransferEmailProps,
  CommunityRoleChangeEmailProps,
  CrmOutreachEmailProps,
  DataExportReadyEmailProps,
  EmailRenderResult,
  EmailRenderResultPromise,
  EmailVerificationEmailProps,
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  LoginTokenEmailProps,
  PostReferralLinkEmailProps,
  RenewalPriceIncreaseEmailProps,
  SupportReplyEmailProps,
  WelcomeEmailProps,
}

export declare function renderCommunityApplicationDecisionEmail(
  props: CommunityApplicationDecisionEmailProps,
): EmailRenderResultPromise
export declare function renderCommunityInviteEmail(
  props: CommunityInviteEmailProps,
): EmailRenderResultPromise
export declare function renderCommunityModerationSummaryEmail(
  props: CommunityModerationSummaryEmailProps,
): EmailRenderResultPromise
export declare function renderCommunityOwnershipTransferEmail(
  props: CommunityOwnershipTransferEmailProps,
): EmailRenderResultPromise
export declare function renderCommunityRoleChangeEmail(
  props: CommunityRoleChangeEmailProps,
): EmailRenderResultPromise
export declare function renderDataExportReadyEmail(
  props: DataExportReadyEmailProps,
): EmailRenderResultPromise
export declare function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): EmailRenderResultPromise
export declare function renderFollowNewsSourcesEmail(
  props: FollowNewsSourcesEmailProps,
): EmailRenderResultPromise
export declare function renderFollowTopicsEmail(
  props: FollowTopicsEmailProps,
): EmailRenderResultPromise
export declare function renderLoginTokenEmail(props: LoginTokenEmailProps): EmailRenderResultPromise
export declare function renderCrmOutreachEmail(
  props: CrmOutreachEmailProps,
): EmailRenderResultPromise
export declare function renderPostReferralLinkEmail(
  props: PostReferralLinkEmailProps,
): EmailRenderResultPromise
export declare function renderRenewalPriceIncreaseEmail(
  props: RenewalPriceIncreaseEmailProps,
): EmailRenderResultPromise
export declare function renderWelcomeEmail(props: WelcomeEmailProps): EmailRenderResultPromise
export declare function renderSupportReplyEmail(
  props: SupportReplyEmailProps,
): EmailRenderResultPromise
