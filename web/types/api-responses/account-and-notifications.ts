import type * as Api from './shared'
import type { UrlEmbed } from './posts-topics-and-feeds'
import type {
  Notification,
  NotificationResult,
  WebPushSubscription,
} from './pagination-and-entities'
import type { CommunityRelationItem } from './communities'
import type { PublicUrl } from './urls-onboarding-and-trends'

type ElectionVote = Api.ElectionVote
type HostnameElection = Api.HostnameElection
type Hostname = Api.Hostname
type Post = Api.Post
type Topic = Api.Topic
type TopicElection = Api.TopicElection
type ProfileLink = Api.ProfileLink
type PublicUser = Api.PublicUser
type User = Api.User
type UserSearchResult = Api.UserSearchResult
type UserMetrics = Api.UserMetrics
type IndividualCard = Api.IndividualCard
type SpendingCategory = Api.SpendingCategory
type PointValuation = Api.PointValuation
type RewardsProgramStatus = Api.RewardsProgramStatus
type Household = Api.Household
type UserProfile = Api.UserProfile
type PrivateIdentity = Api.PrivateIdentity
type FinancialProfile = Api.FinancialProfile
type EntityRelation = Api.EntityRelation
type ViewRssFeed = Api.ViewRssFeed
type RssFeedItem = Api.RssFeedItem
type PageInfo = Api.PageInfo
type ListResponse<T> = Api.ListResponse<T>

export interface ProfileResponseBody {
  profile: UserProfile
}

export interface ProfileLinkResponseBody {
  profile_link: ProfileLink
}

/**
 * GET /api/v1/my/profile/links and PUT /api/v1/my/profile/links/order — bounded by a
 * mutation-enforced MAX_PROFILE_LINKS cap, so no page_info (unlike ListResponse<T>).
 */
export interface MyProfileLinksResponseBody {
  results: ProfileLink[]
}

export interface FinancialProfileResponseBody {
  financial_profile: FinancialProfile | null
}

export interface IdentityResponseBody {
  identity: PrivateIdentity
}

export interface IdentityVerificationResponseBody {
  verification_status: import('../user').IdentityVerificationStatus
  verification_provider: string | null
  verification_completed_at: string | null
  verified_badge_visible: boolean
  public_verified_name_display: import('../user').PublicVerifiedNameDisplay
}

export interface IndividualCardResponseBody {
  card: IndividualCard
}

export interface SpendingCategoryResponseBody {
  spending_category: SpendingCategory
}

export interface RewardsProgramStatusResponseBody {
  rewards_program_status: RewardsProgramStatus
}

export interface PointValuationResponseBody {
  point_valuation: PointValuation
}

export interface BookmarkResponseBody {
  bookmark: EntityRelation
}

export interface BookmarksResponseBody {
  bookmarks: Record<string, boolean>
}

export interface HouseholdResponseBody {
  household: Household
}

export interface AuthMeResponseBody {
  user: User
}

export interface UserResponseBody {
  user: User
  user_metrics?: UserMetrics
  profile_links?: ProfileLink[]
  user_bio_html?: string | null
}

export type UsersListResponseBody = ListResponse<PublicUser> & {
  muted?: Record<string, boolean>
}

export type UsersSearchResponseBody = ListResponse<UserSearchResult> & {
  muted?: Record<string, boolean>
}

export type TopicsListResponseBody = ListResponse<Topic>

export type PostsListResponseBody = ListResponse<Post>

export type RssFeedsListResponseBody = ListResponse<ViewRssFeed> & {
  topic_elections: Record<string, TopicElection>
  hostname_elections: Record<string, HostnameElection>
  election_votes?: Record<string, ElectionVote>
  bookmarks?: Record<string, Record<string, boolean>>
}

export type RssFeedItemsListResponseBody = ListResponse<RssFeedItem> & {
  rss_feed_item_thumbnail_url?: Record<string, string>
  rss_feed_item_embeds?: Record<string, UrlEmbed>
}

export type UrlsListResponseBody = ListResponse<PublicUrl>

export type HostnamesListResponseBody = ListResponse<Hostname>

export type CommunitiesListResponseBody = ListResponse<CommunityRelationItem>

export interface NotificationCommunity {
  id: string
  slug: string
  name: string
}

export interface FollowerDistributionAcceptedResponseBody {
  status: 'accepted'
  distribution_id: string
}

export interface NotificationsResponseBody {
  results: NotificationResult[]
  notifications: Record<string, Notification>
  communities?: Record<string, NotificationCommunity>
  page_info: PageInfo
}

export interface NotificationsUnreadSummaryResponseBody {
  unread_count: number
  results: NotificationResult[]
  notifications: Record<string, Notification>
  communities: Record<string, NotificationCommunity>
}

export interface NotificationRedirectTargetResponseBody {
  target_url: string
}

export type WebPushSubscriptionsResponseBody = ListResponse<WebPushSubscription>

export interface WebPushSubscriptionResponseBody {
  web_push_subscription: WebPushSubscription
}
