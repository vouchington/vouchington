import type { ReactElement } from 'react'
import type { Money } from '@ts-shared/money'

export type EmailRenderResult = {
  subject: string
  html: string
  text: string
}

export type EmailRenderResultPromise = Promise<EmailRenderResult>

export type PreviewableEmailComponent<TProps> = ((props: TProps) => ReactElement) & {
  PreviewProps?: TProps
}

export type LocalizedEmailProps = {
  uiLocale?: string | null
}

export type CommunityInviteEmailProps = LocalizedEmailProps & {
  communityName: string
  inviterName: string
  code: string
}

export type LoginTokenEmailProps = LocalizedEmailProps & {
  emailAddress: string
  token: string
  expiration: string
}

export type EmailVerificationEmailProps = LocalizedEmailProps & {
  token: string
}

export type DataExportReadyEmailProps = LocalizedEmailProps & {
  downloadUrl: string
  expiresInDays: number
}

export type RenewalPriceIncreaseEmailProps = LocalizedEmailProps & {
  plan: string
  interval: string
  currentPrice: Money
  newPrice: Money
  renewsAt: string | Date
  membershipUrl: string
}

export type WelcomeEmailProps = LocalizedEmailProps & {
  userName?: string
}

export type CommunityApplicationDecisionEmailProps = LocalizedEmailProps & {
  communityName: string
  communityUrl: string
  status: 'approved' | 'rejected'
  rejectionReason?: string
}

export type CommunityRoleChangeEmailProps = LocalizedEmailProps & {
  communityName: string
  communityUrl: string
  newRole: 'owner' | 'moderator' | 'member'
  direction: 'promoted' | 'demoted'
}

export type CommunityOwnershipTransferEmailProps = LocalizedEmailProps & {
  communityName: string
  communityUrl: string
  recipientRole: 'new_owner' | 'previous_owner'
}

export type SupportReplyEmailProps = LocalizedEmailProps & {
  bodyText: string
  subject?: string
}

export type FollowTopicsEmailProps = LocalizedEmailProps & {
  userName?: string
  topics: {
    name: string
    url: string
    reason?: string
  }[]
  settingsUrl: string
  unsubscribeUrl: string
  physicalAddress: string
}

export type PostReferralLinkEmailProps = LocalizedEmailProps & {
  userName?: string
  referralPrograms: {
    name: string
    url: string
    linkCount?: number
  }[]
  settingsUrl: string
  unsubscribeUrl: string
  physicalAddress: string
}

export type FollowNewsSourcesEmailProps = LocalizedEmailProps & {
  userName?: string
  sources: {
    name: string
    url: string
    description?: string
  }[]
  settingsUrl: string
  unsubscribeUrl: string
  physicalAddress: string
}

export type CommunityModerationSummaryEmailProps = LocalizedEmailProps & {
  userName?: string
  generatedForDate: string
  settingsUrl: string
  unsubscribeUrl: string
  physicalAddress: string
  communities: {
    name: string
    url: string
    pendingPostReviews: number
    pendingApplications: number
    pendingReports: number
    escalatedItems: number
    suspectedBanEvaders: number
    netMemberChange: number
    totalActiveMembers: number
    newDiscussionPosts: number
    newReviewPosts: number
    newDataPointPosts: number
    topDiscussionTitle: string | null
    topDiscussionReplyCount: number
    activeMemberCount: number
    activeMemberRate: number
  }[]
}
