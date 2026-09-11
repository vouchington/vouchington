import { createPaginationParser } from '@modules/pagination'
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

export type PostListType = RouteListType<'posts'>
export type TopicRouteListType = RouteListType<'topics'>
export type TopicServiceListType = ServiceListType<'topics'>
export type UserRouteListType = RouteListType<'users'>
export type UserServiceListType = ServiceListType<'users'>
export type RssFeedListType = RouteListType<'rss-feeds'>
export type RssFeedItemListType = RouteListType<'rss-feed-items'>
export type UrlListType = RouteListType<'urls'>
export type HostnameListType = RouteListType<'domains'>
export type CommunityRouteListType = RouteListType<'communities'>
export type CommunityServiceListType = ServiceListType<'communities'>

export const POST_LIST_TYPES = routeListSet('posts') as Set<PostListType>
export const TOPIC_LIST_TYPES = routeListSet('topics') as Set<TopicRouteListType>
export const USER_LIST_TYPES = routeListSet('users') as Set<UserRouteListType>
export const RSS_FEED_LIST_TYPES = routeListSet('rss-feeds') as Set<RssFeedListType>
export const RSS_FEED_ITEM_LIST_TYPES = routeListSet('rss-feed-items') as Set<RssFeedItemListType>
export const URL_LIST_TYPES = routeListSet('urls') as Set<UrlListType>
export const HOSTNAME_LIST_TYPES = routeListSet('domains') as Set<HostnameListType>
export const COMMUNITY_LIST_TYPES = routeListSet('communities') as Set<CommunityRouteListType>

export const PRIVATE_TOPIC_LIST_TYPES = privateRouteListSet('topics') as Set<TopicRouteListType>
export const PRIVATE_USER_LIST_TYPES = privateRouteListSet('users') as Set<UserRouteListType>

export const TOPIC_SERVICE_LIST_TYPES = serviceListMap('topics') as Record<
  TopicRouteListType,
  TopicServiceListType
>
export const USER_SERVICE_LIST_TYPES = serviceListMap('users') as Record<
  UserRouteListType,
  UserServiceListType
>
export const COMMUNITY_SERVICE_LIST_TYPES = serviceListMap('communities') as Record<
  CommunityRouteListType,
  CommunityServiceListType
>

/* c8 ignore start -- exercised by focused discovery-matrix tests outside pre-push's dependency sample. */
export function getCollectionRouteConfig(
  routeSegment: UserProfileCollection['routeSegment'],
  routeListType: string,
): UserProfileCollection {
  const collection = USER_PROFILE_COLLECTIONS.find(
    item => item.routeSegment === routeSegment && item.routeListType === routeListType,
  )
  if (!collection) {
    throw new Error(`Missing user collection route config for ${routeSegment}/${routeListType}`)
  }
  return collection
}
/* c8 ignore stop */

export const rssFeedsPaginationParser = createPaginationParser({
  cursor: { type: 'timestamp' },
  limit: { min: 1, max: 25, default: 25 },
})

export const postsPaginationParser = createPaginationParser({
  cursor: { type: 'timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

export const usersPaginationParser = createPaginationParser({
  cursor: { type: 'timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

export const relationCollectionPaginationParser = createPaginationParser({
  cursor: { type: ['timestamp', 'score', 'simple'] },
  limit: { min: 1, max: 100, default: 25 },
})

function routeListSet(routeSegment: UserProfileCollection['routeSegment']): Set<string> {
  const listTypes: string[] = []
  for (const collection of USER_PROFILE_COLLECTIONS) {
    if (collection.routeSegment === routeSegment) listTypes.push(collection.routeListType)
  }
  return new Set(listTypes)
}

function privateRouteListSet(routeSegment: UserProfileCollection['routeSegment']): Set<string> {
  const listTypes: string[] = []
  for (const collection of USER_PROFILE_COLLECTIONS) {
    if (collection.routeSegment === routeSegment && collection.access === 'owner') {
      listTypes.push(collection.routeListType)
    }
  }
  return new Set(listTypes)
}

function serviceListMap(
  routeSegment: UserProfileCollection['routeSegment'],
): Record<string, string> {
  const entries: Array<[string, string]> = []
  for (const collection of USER_PROFILE_COLLECTIONS) {
    if (collection.routeSegment === routeSegment) {
      entries.push([collection.routeListType, collection.serviceListType])
    }
  }
  return Object.fromEntries(entries)
}
