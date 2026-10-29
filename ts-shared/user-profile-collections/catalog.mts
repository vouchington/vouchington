import { COMMUNITY_COLLECTIONS } from './collections/communities.mts'
import { POST_COLLECTIONS } from './collections/posts.mts'
import { RSS_FEED_COLLECTIONS } from './collections/rss-feeds.mts'
import { RSS_ITEM_DOMAIN_COLLECTIONS } from './collections/rss-items-domains.mts'
import { TOPIC_COLLECTIONS } from './collections/topics.mts'
import { USER_COLLECTIONS } from './collections/users.mts'

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

export function getProfileCollectionRouteSuffix(collection: UserProfileCollection): string {
  return `${collection.routeSegment}/${collection.routeListType}`
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
