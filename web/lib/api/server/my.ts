import { cache } from 'react'
import { serverApi } from './instance'
import type { UserWarningsResponse } from '@/lib/api/client/warnings'
import type {
  ListResponse,
  ProfileResponseBody,
  IdentityResponseBody,
  IdentityVerificationResponseBody,
  LandingPageCandidatesResponseBody,
  LandingPageDetailResponseBody,
  MyLandingPageListResponseBody,
  MyProfileLinksResponseBody,
  NotificationRedirectTargetResponseBody,
  NotificationsResponseBody,
  WebPushSubscriptionsResponseBody,
  FinancialProfileResponseBody,
  ContributionStatusResponseBody,
  ContributionLimitAction,
  ReferralClickLogResponseBody,
  FriendRecommendationsResponseBody,
  MyCommunityMembershipsResponseBody,
} from '@/types/api-responses'
import type { EmailAddress } from '@/types/user'
import type { SpendingCategory, PointValuation, RewardsProgramStatus } from '@/types/my'

export { getMyBans, getMyRemovedPosts } from './my-moderation'

type HeaderOptions = { headers?: Record<string, string> }
type PaginationOptions = { after?: string; limit?: number; headers?: Record<string, string> }

export { getMyCards } from './my-cards'

export const getMyProfile = cache(async (options?: HeaderOptions): Promise<ProfileResponseBody> =>
  serverApi.get<ProfileResponseBody>('/api/v1/my/profile', options),
)

export const getMyProfileLinks = cache(
  async (options?: HeaderOptions): Promise<MyProfileLinksResponseBody> =>
    serverApi.get<MyProfileLinksResponseBody>('/api/v1/my/profile/links', options),
)

export const getMyLandingPages = cache(
  async (options?: HeaderOptions): Promise<MyLandingPageListResponseBody> =>
    serverApi.get<MyLandingPageListResponseBody>('/api/v1/my/landing-pages', options),
)

export const getMyLandingPageCandidates = cache(
  async (options?: HeaderOptions): Promise<LandingPageCandidatesResponseBody> =>
    serverApi.get<LandingPageCandidatesResponseBody>(
      '/api/v1/my/landing-pages/candidates',
      options,
    ),
)

export const getMyLandingPage = cache(
  async (pageId: string, options?: HeaderOptions): Promise<LandingPageDetailResponseBody> =>
    serverApi.get<LandingPageDetailResponseBody>(`/api/v1/my/landing-pages/${pageId}`, options),
)

export const getMyIdentity = cache(async (options?: HeaderOptions): Promise<IdentityResponseBody> =>
  serverApi.get<IdentityResponseBody>('/api/v1/my/identity', options),
)

export const getMyEmailAddresses = cache(
  async (options?: PaginationOptions): Promise<ListResponse<EmailAddress>> =>
    serverApi.get<ListResponse<EmailAddress>>('/api/v1/my/email-addresses', {
      headers: options?.headers,
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)

export const getMySpendingCategories = cache(
  async (options?: PaginationOptions): Promise<ListResponse<SpendingCategory>> =>
    serverApi.get<ListResponse<SpendingCategory>>('/api/v1/my/spending-categories', {
      headers: options?.headers,
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)

export const getMyRewardsProgramPointValuations = cache(
  async (options?: PaginationOptions): Promise<ListResponse<PointValuation>> =>
    serverApi.get<ListResponse<PointValuation>>('/api/v1/my/rewards-program-point-valuations', {
      headers: options?.headers,
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)

export const getMyRewardsProgramStatuses = cache(
  async (options?: PaginationOptions): Promise<ListResponse<RewardsProgramStatus>> =>
    serverApi.get<ListResponse<RewardsProgramStatus>>('/api/v1/my/rewards-program-statuses', {
      headers: options?.headers,
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)

export const getMyNotifications = cache(
  async (options?: PaginationOptions): Promise<NotificationsResponseBody> => {
    const searchParams: Record<string, string> = {}
    if (options?.after) searchParams.after = options.after
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    return serverApi.get<NotificationsResponseBody>('/api/v1/my/notifications', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getMyWebPushSubscriptions = cache(
  async (options?: PaginationOptions): Promise<WebPushSubscriptionsResponseBody> =>
    serverApi.get<WebPushSubscriptionsResponseBody>(
      '/api/v1/my/notifications/push-subscriptions',
      options
        ? {
            headers: options.headers,
            searchParams: { after: options.after, limit: options.limit },
          }
        : undefined,
    ),
)

export const getMyNotificationRedirectTarget = cache(
  async (
    notificationId: string,
    options?: HeaderOptions,
  ): Promise<NotificationRedirectTargetResponseBody> =>
    serverApi.get<NotificationRedirectTargetResponseBody>(
      `/api/v1/my/notifications/${notificationId}/redirect-target`,
      options,
    ),
)

export const getMyFinancialProfile = cache(
  async (options?: HeaderOptions): Promise<FinancialProfileResponseBody> =>
    serverApi.get<FinancialProfileResponseBody>('/api/v1/my/financial-profile', options),
)

export const getMyContributionStatus = cache(
  async (
    options?: HeaderOptions & {
      action?: ContributionLimitAction
    },
  ): Promise<ContributionStatusResponseBody> => {
    const { action, ...rest } = options ?? {}
    const path = action
      ? `/api/v1/my/contribution-status?action=${encodeURIComponent(action)}`
      : '/api/v1/my/contribution-status'
    return serverApi.get<ContributionStatusResponseBody>(path, rest)
  },
)

export const getMyIdentityVerification = cache(
  async (options?: HeaderOptions): Promise<IdentityVerificationResponseBody> =>
    serverApi.get<IdentityVerificationResponseBody>('/api/v1/my/identity-verification', options),
)

export const getMyReferralClicks = cache(
  async (options?: PaginationOptions): Promise<ReferralClickLogResponseBody> => {
    const searchParams: Record<string, string> = {}
    if (options?.after) searchParams.after = options.after
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    return serverApi.get<ReferralClickLogResponseBody>('/api/v1/my/referral-clicks', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getMyFriendRecommendations = cache(
  async (options?: PaginationOptions): Promise<FriendRecommendationsResponseBody> => {
    const searchParams: Record<string, string> = {}
    if (options?.after) searchParams.after = options.after
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    return serverApi.get<FriendRecommendationsResponseBody>('/api/v1/my/friend-recommendations', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getMyWarnings = cache(async (options?: HeaderOptions): Promise<UserWarningsResponse> =>
  serverApi.get<UserWarningsResponse>('/api/v1/my/warnings', options),
)

export const getMyCommunities = cache(
  async (options?: HeaderOptions): Promise<MyCommunityMembershipsResponseBody> =>
    serverApi.get<MyCommunityMembershipsResponseBody>('/api/v1/my/communities', options),
)
