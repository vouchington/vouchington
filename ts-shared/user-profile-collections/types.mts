import type { MessageKey } from '@ts-shared/ui-messages'

export type UserProfileCollectionGroup =
  | 'posts'
  | 'topics'
  | 'users'
  | 'rss'
  | 'links'
  | 'domains'
  | 'communities'

export type UserProfileCollectionRouteSegment =
  | 'posts'
  | 'topics'
  | 'users'
  | 'rss-feeds'
  | 'rss-feed-items'
  | 'urls'
  | 'domains'
  | 'communities'

export type UserProfileCollectionAccess = 'public' | 'owner'
export type UserProfileCollectionMetricGroup = 'count' | 'private_count'

export type UserProfileCollectionVisibilityField =
  | 'follows_visibility'
  | 'topic_follows_visibility'
  | 'rss_feed_follows_visibility'
  | 'community_memberships_visibility'
  | 'followers_visibility'

export type UserProfileCollectionEntityType =
  | 'post'
  | 'topic'
  | 'user'
  | 'rss_feed'
  | 'rss_feed_item'
  | 'url'
  | 'url_hostname'
  | 'community'

export type UserProfileCollectionPredicate =
  | 'save'
  | 'hide'
  | 'follow'
  | 'mute'
  | 'block'
  | 'subscribe'
  | 'subscribe_posts'
  | 'subscribe_rss_feed_items'
  | 'dismiss_recommendation'
  | 'proxy_follow'
  | 'proxy_mute'

export type UserProfileCollectionRelation = {
  tableName: string
  entityType: UserProfileCollectionEntityType
  predicate: UserProfileCollectionPredicate
  direction: 'object' | 'subject'
  targetTable: string
  targetDeletedAtFilter?: boolean
}

export type UserProfileCollectionRecentView = {
  entityType: Extract<UserProfileCollectionEntityType, 'topic' | 'rss_feed_item' | 'rss_feed'>
}

export type UserProfileCollectionAction = {
  group: 'post' | 'topic' | 'user' | 'rssFeed' | 'rssFeedItem' | 'url' | 'domain' | 'community'
  key: string
  entityType: UserProfileCollectionEntityType
  predicate: UserProfileCollectionPredicate
  activeLabel: MessageKey
  inactiveLabel: MessageKey
  errorLabel: MessageKey
}

export type UserProfileCollectionEntry = {
  id: string
  group: UserProfileCollectionGroup
  routeSegment: UserProfileCollectionRouteSegment
  routeListType: string
  serviceListType: string
  access: UserProfileCollectionAccess
  visibilityField?: UserProfileCollectionVisibilityField
  metricGroup: UserProfileCollectionMetricGroup
  metricKey: string
  tabValue: string
  tabLabel: string
  managementTab: boolean
  communityTab?: boolean
  communityTabLabel?: string
  topLevelTab?: Exclude<UserProfileCollectionGroup, 'rss'> | 'rss'
  action?: UserProfileCollectionAction
  relation?: UserProfileCollectionRelation
  recentView?: UserProfileCollectionRecentView
}

export type CollectionInput = Omit<
  UserProfileCollectionEntry,
  'serviceListType' | 'metricGroup' | 'managementTab' | 'topLevelTab' | 'tabValue'
> & {
  serviceListType?: string
  metricGroup?: UserProfileCollectionMetricGroup
  managementTab?: boolean
  topLevelTab?: Exclude<UserProfileCollectionGroup, 'rss'> | 'rss'
  tabValue?: string
}
