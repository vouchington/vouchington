import type {
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/background/enqueues/email-digests-domain'

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
