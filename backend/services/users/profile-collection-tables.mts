import {
  USER_PROFILE_COLLECTIONS,
  type UserProfileCollection,
} from '@ts-shared/user-profile-collections'

type CollectionForSegment<Segment extends string> = Extract<
  UserProfileCollection,
  { routeSegment: Segment }
>
type RouteListType<Segment extends string> = CollectionForSegment<Segment>['routeListType']
type ServiceListType<Segment extends string> = CollectionForSegment<Segment>['serviceListType']
type RelationListType<Segment extends string> = Extract<
  CollectionForSegment<Segment>,
  { relation: object }
>['serviceListType']

export type TopicListType = ServiceListType<'topics'>
export type UserListType = ServiceListType<'users'>
export type RssFeedListType = ServiceListType<'rss-feeds'>
export type RssFeedItemListType = ServiceListType<'rss-feed-items'>
export type PostListType = RouteListType<'posts'>
export type UrlListType = ServiceListType<'urls'>
export type HostnameListType = ServiceListType<'domains'>
export type CommunityListType = ServiceListType<'communities'>

export const TOPIC_LIST_TABLES = relationTableMap('topics') as Record<
  RelationListType<'topics'>,
  string
>
export const USER_LIST_TABLES = relationTableMap('users') as Record<
  RelationListType<'users'>,
  string
>
export const POST_LIST_TABLES = {
  saved: 'relation__user__save__post',
  hidden: 'relation__user__hide__post',
  following: 'relation__user__follow__post',
  subscribed: 'relation__user__subscribe__post',
} as const satisfies Record<PostListType, string>
export type PostRelationTableName = (typeof POST_LIST_TABLES)[PostListType]
export const RSS_FEED_LIST_TABLES = relationTableMap('rss-feeds') as Record<
  RelationListType<'rss-feeds'>,
  string
>
export const RSS_FEED_ITEM_LIST_TABLES = relationTableMap('rss-feed-items') as Record<
  RelationListType<'rss-feed-items'>,
  string
>
export const URL_LIST_TABLES = relationTableMap('urls') as Record<RelationListType<'urls'>, string>
export const HOSTNAME_LIST_TABLES = relationTableMap('domains') as Record<
  RelationListType<'domains'>,
  string
>
export const COMMUNITY_LIST_TABLES = relationTableMap('communities') as Record<
  RelationListType<'communities'>,
  string
>

export type RelationTableName = NonNullable<UserProfileCollection['relation']>['tableName']

function relationTableMap(
  routeSegment: UserProfileCollection['routeSegment'],
): Record<string, string> {
  const entries: Array<[string, string]> = []
  for (const collection of USER_PROFILE_COLLECTIONS) {
    if (collection.routeSegment === routeSegment && collection.relation) {
      entries.push([collection.serviceListType, collection.relation.tableName])
    }
  }
  return Object.fromEntries(entries)
}
