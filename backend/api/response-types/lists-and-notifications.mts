import type * as Deps from './dependencies.mts'

type ElectionVote = Deps.ElectionVote
type ViewHostnameElection = Deps.ViewHostnameElection
type ViewTopicElection = Deps.ViewTopicElection
type PublicUser = Deps.PublicUser
type UserSearchResult = Deps.PublicUser | Deps.PrivateUser
type ViewRssFeed = Deps.ViewRssFeed
type ViewRssFeedItem = Deps.ViewRssFeedItem
type Notification = Deps.Notification
type NotificationResult = Deps.NotificationResult
type WebPushSubscriptionRecord = Deps.WebPushSubscriptionRecord
type PageInfo = Deps.PageInfo
type NotificationCommunity = {
  id: string
  slug: string
  name: string
}
type ListResponse<T> = Deps.ListResponse<T>

export type BookmarksResponseBody = {
  bookmarks: Record<string, boolean>
}

export type UsersListResponseBody = ListResponse<PublicUser> & {
  muted?: Record<string, boolean>
}

export type UsersSearchResponseBody = ListResponse<UserSearchResult> & {
  muted?: Record<string, boolean>
}

export type TopicsListResponseBody = ListResponse<import('@services/topics/types').Topic>

export type RssFeedsListResponseBody = ListResponse<ViewRssFeed> & {
  topic_elections: Record<string, ViewTopicElection>
  hostname_elections: Record<string, ViewHostnameElection>
  election_votes?: Record<string, ElectionVote>
}

export type RssFeedItemsListResponseBody = ListResponse<ViewRssFeedItem>

export type NotificationsResponseBody = {
  results: NotificationResult[]
  notifications: Record<string, Notification>
  communities: Record<string, NotificationCommunity>
  page_info: PageInfo
}

export type NotificationsUnreadSummaryResponseBody = {
  unread_count: number
  results: NotificationResult[]
  notifications: Record<string, Notification>
  communities: Record<string, NotificationCommunity>
}

export type NotificationRedirectTargetResponseBody = {
  target_url: string
}

export type WebPushSubscriptionsResponseBody = ListResponse<WebPushSubscriptionRecord>

export type WebPushSubscriptionResponseBody = {
  web_push_subscription: WebPushSubscriptionRecord
}

// Re-export RSS feed items response body from services layer
export type { RssFeedItemsFeedResponseBody } from '@services/rss-feed-items/types'

export type ReferralClickLogResponseBody = {
  results: Array<{ __entity_type: 'referral_click_log'; id: string }>
  clicks: Record<string, import('@voucha/types/entities/referral-click-log').ReferralClickLogEntry>
  users: Record<string, PublicUser>
  page_info: PageInfo
}
