import { COMMUNITY_COLLECTIONS } from './collections/communities.mts'
import { POST_COLLECTIONS } from './collections/posts.mts'
import { RSS_FEED_COLLECTIONS } from './collections/rss-feeds.mts'
import { RSS_ITEM_DOMAIN_COLLECTIONS } from './collections/rss-items-domains.mts'
import { TOPIC_COLLECTIONS } from './collections/topics.mts'
import { USER_COLLECTIONS } from './collections/users.mts'
import type { UserProfileCollectionRouteSegment } from './types.mts'

export type {
  UserProfileCollectionAccess,
  UserProfileCollectionAction,
  UserProfileCollectionEntityType,
  UserProfileCollectionEntry,
  UserProfileCollectionGroup,
  UserProfileCollectionMetricGroup,
  UserProfileCollectionPredicate,
  UserProfileCollectionRecentView,
  UserProfileCollectionRelation,
  UserProfileCollectionRouteSegment,
  UserProfileCollectionVisibilityField,
} from './types.mts'

export const USER_PROFILE_COLLECTIONS = [
  ...POST_COLLECTIONS,
  ...TOPIC_COLLECTIONS,
  ...USER_COLLECTIONS,
  ...RSS_FEED_COLLECTIONS,
  ...RSS_ITEM_DOMAIN_COLLECTIONS,
  ...COMMUNITY_COLLECTIONS,
] as const

export type UserProfileCollection = (typeof USER_PROFILE_COLLECTIONS)[number]
export type UserProfileCollectionId = UserProfileCollection['id']
export type UserProfileRouteSegment = UserProfileCollection['routeSegment']

export const USER_PROFILE_COLLECTION_ROUTE_SEGMENTS = unique(
  USER_PROFILE_COLLECTIONS.map(collection => collection.routeSegment),
)

export const PRIVATE_USER_PROFILE_COLLECTIONS = USER_PROFILE_COLLECTIONS.filter(
  collection => collection.access === 'owner',
)

export const PUBLIC_USER_PROFILE_COLLECTIONS = USER_PROFILE_COLLECTIONS.filter(
  collection => collection.access === 'public',
)

/* c8 ignore start -- exercised by focused catalog tests outside pre-push's dependency sample. */
export function getProfileCollectionRouteSuffix(collection: UserProfileCollection): string {
  return `${collection.routeSegment}/${collection.routeListType}`
}

export function getProfileCollectionRouteSuffixes(
  collections: readonly UserProfileCollection[] = USER_PROFILE_COLLECTIONS,
): string[] {
  return collections.map(getProfileCollectionRouteSuffix)
}
/* c8 ignore stop */

/* c8 ignore start -- exercised by focused catalog tests outside pre-push's dependency sample. */
export function getProfileCollectionsByRouteSegment(
  routeSegment: UserProfileCollectionRouteSegment,
): UserProfileCollection[] {
  return USER_PROFILE_COLLECTIONS.filter(collection => collection.routeSegment === routeSegment)
}
/* c8 ignore stop */

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
