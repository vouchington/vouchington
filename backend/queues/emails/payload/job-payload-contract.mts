import type {
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
  ProcessSendWelcomeEmailVariables,
} from '../types.mts'
import { communityCountKeys } from './job-payload-engagement.mts'
import { templateVariableKeysCoverCanonicalTypes } from './job-payload-templates.mts'

type TopicItem = ProcessSendFollowTopicsEmailVariables['topics'][number]
type ReferralItem = ProcessSendPostReferralLinkEmailVariables['referralPrograms'][number]
type SourceItem = ProcessSendFollowNewsSourcesEmailVariables['sources'][number]
type CommunityItem = ProcessSendCommunityModerationSummaryEmailVariables['communities'][number]

export function emailVariableKeysCoverCanonicalTypes(): true {
  const invite: Exclude<
    keyof ProcessSendCommunityInviteEmailVariables,
    'communityName' | 'inviterName' | 'code' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const login: Exclude<
    keyof ProcessSendEmailAddressLoginTokenVariables,
    'token' | 'expiration' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const verification: Exclude<
    keyof ProcessSendEmailVerificationTokenVariables,
    'token' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const welcome: Exclude<
    keyof ProcessSendWelcomeEmailVariables,
    'userName' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const topics: Exclude<
    keyof ProcessSendFollowTopicsEmailVariables,
    'topics' | 'userName' | 'settingsUrl' | 'unsubscribeUrl' | 'physicalAddress' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const referrals: Exclude<
    keyof ProcessSendPostReferralLinkEmailVariables,
    | 'referralPrograms'
    | 'userName'
    | 'settingsUrl'
    | 'unsubscribeUrl'
    | 'physicalAddress'
    | 'uiLocale'
  > extends never
    ? true
    : never = true
  const sources: Exclude<
    keyof ProcessSendFollowNewsSourcesEmailVariables,
    'sources' | 'userName' | 'settingsUrl' | 'unsubscribeUrl' | 'physicalAddress' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const moderation: Exclude<
    keyof ProcessSendCommunityModerationSummaryEmailVariables,
    | 'userName'
    | 'generatedForDate'
    | 'settingsUrl'
    | 'unsubscribeUrl'
    | 'physicalAddress'
    | 'uiLocale'
    | 'communities'
  > extends never
    ? true
    : never = true
  const topicItem: Exclude<keyof TopicItem, 'name' | 'url' | 'reason'> extends never
    ? true
    : never = true
  const referralItem: Exclude<keyof ReferralItem, 'name' | 'url' | 'linkCount'> extends never
    ? true
    : never = true
  const sourceItem: Exclude<keyof SourceItem, 'name' | 'url' | 'description'> extends never
    ? true
    : never = true
  const communityItem: Exclude<
    keyof CommunityItem,
    'name' | 'url' | 'topDiscussionTitle' | (typeof communityCountKeys)[number]
  > extends never
    ? true
    : never = true
  return (
    invite &&
    login &&
    verification &&
    welcome &&
    topics &&
    referrals &&
    sources &&
    moderation &&
    topicItem &&
    referralItem &&
    sourceItem &&
    communityItem &&
    templateVariableKeysCoverCanonicalTypes()
  )
}
