import type {
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendWelcomeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendCommunityModerationSummaryEmailVariables,
} from '../types.mts'

export const inviteVariableKeys = {
  communityName: true,
  inviterName: true,
  code: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityInviteEmailVariables, true>

export const loginVariableKeys = {
  token: true,
  expiration: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendEmailAddressLoginTokenVariables, true>

export const verificationVariableKeys = {
  token: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendEmailVerificationTokenVariables, true>

export const welcomeVariableKeys = {
  userName: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendWelcomeEmailVariables, true>

export const dataExportVariableKeys = {
  downloadUrl: true,
  expiresInDays: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendDataExportReadyEmailVariables, true>

export const applicationVariableKeys = {
  communityName: true,
  communityUrl: true,
  rejectionReason: true,
  status: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityApplicationDecisionEmailVariables, true>

export const roleVariableKeys = {
  communityName: true,
  communityUrl: true,
  newRole: true,
  direction: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityRoleChangeEmailVariables, true>

export const ownershipVariableKeys = {
  communityName: true,
  communityUrl: true,
  recipientRole: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityOwnershipTransferEmailVariables, true>

export const topicsVariableKeys = {
  topics: true,
  userName: true,
  settingsUrl: true,
  unsubscribeUrl: true,
  physicalAddress: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendFollowTopicsEmailVariables, true>

export const referralsVariableKeys = {
  referralPrograms: true,
  userName: true,
  settingsUrl: true,
  unsubscribeUrl: true,
  physicalAddress: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendPostReferralLinkEmailVariables, true>

export const sourcesVariableKeys = {
  sources: true,
  userName: true,
  settingsUrl: true,
  unsubscribeUrl: true,
  physicalAddress: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendFollowNewsSourcesEmailVariables, true>

export const moderationVariableKeys = {
  userName: true,
  generatedForDate: true,
  settingsUrl: true,
  unsubscribeUrl: true,
  physicalAddress: true,
  uiLocale: true,
  communities: true,
} as const satisfies Record<keyof ProcessSendCommunityModerationSummaryEmailVariables, true>

export const topicItemVariableKeys = {
  name: true,
  url: true,
  reason: true,
} as const satisfies Record<keyof ProcessSendFollowTopicsEmailVariables['topics'][number], true>

export const referralItemVariableKeys = {
  name: true,
  url: true,
  linkCount: true,
} as const satisfies Record<
  keyof ProcessSendPostReferralLinkEmailVariables['referralPrograms'][number],
  true
>

export const sourceItemVariableKeys = {
  name: true,
  url: true,
  description: true,
} as const satisfies Record<
  keyof ProcessSendFollowNewsSourcesEmailVariables['sources'][number],
  true
>

export const communityItemVariableKeys = {
  name: true,
  url: true,
  topDiscussionTitle: true,
  pendingPostReviews: 'number',
  pendingApplications: 'number',
  pendingReports: 'number',
  escalatedItems: 'number',
  suspectedBanEvaders: 'number',
  netMemberChange: 'number',
  totalActiveMembers: 'number',
  newDiscussionPosts: 'number',
  newReviewPosts: 'number',
  newDataPointPosts: 'number',
  topDiscussionReplyCount: 'number',
  activeMemberCount: 'number',
  activeMemberRate: 'number',
} as const satisfies Record<
  keyof ProcessSendCommunityModerationSummaryEmailVariables['communities'][number],
  true | 'number'
>
