import type { PrivateUser } from '@services/users/types'
import type { ViewRssFeed } from './types.mts'
import {
  getTopicElectionVotesByUser,
  type ViewTopicElection,
} from '@services/elections-votes/topic'
import type { ElectionVote } from '@services/elections-votes/shared'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import type { ViewHostnameElection } from '@services/elections-votes/hostname'
import { getHostnameElectionsByIdBatch } from '@services/elections-votes/hostname/get-election-batch'
import { getTopicElectionsByIdBatch } from '@services/elections-votes/topic/get-election-batch'
import { caches } from '@services/entity-cache/caches'
import { indexById } from '@modules/utils'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feeds, so importing entity-fetch's cached getters back into rss-feeds
// would create a fresh rss-feeds<->entity-fetch cycle. Same cache instances/TTL/invalidation-keys
// as entity-fetch's getHostnameElectionByIdCachedBatch/getTopicElectionByIdCachedBatch.
const getHostnameElectionByIdCachedBatch = caches.hostname_elections.cacheGetByAnyBatch(
  getHostnameElectionsByIdBatch,
)
const getTopicElectionByIdCachedBatch = caches.topic_elections.cacheGetByAnyBatch(
  getTopicElectionsByIdBatch,
)

/**
 * Shape of the sidecar maps included alongside RSS feed list results.
 * `topic_elections` and `hostname_elections` are always present (possibly empty).
 * `election_votes` and `bookmarks` are omitted for anonymous viewers and when there
 * is no relevant data for the authenticated viewer.
 */
export interface RssFeedSidecars {
  topic_elections: Record<string, ViewTopicElection>
  hostname_elections: Record<string, ViewHostnameElection>
  election_votes?: Record<string, ElectionVote>
  bookmarks?: Record<string, Record<string, boolean>>
}

/**
 * Builds the election and bookmark sidecar maps for a page of RSS feed results.
 *
 * Always fetches `topic_elections` and `hostname_elections` in parallel (Valkey-cached).
 * When `currentUser` is present, also fetches viewer-keyed `election_votes` and `bookmarks`
 * in a second parallel batch. The optional fields are omitted when empty so the response
 * shape matches the documented contract: "Both are omitted for anonymous viewers and when
 * there is no relevant data."
 */
export async function buildRssFeedSidecars(
  feeds: ViewRssFeed[],
  currentUser: PrivateUser | null,
): Promise<RssFeedSidecars> {
  const topicIds = [...new Set(feeds.map(feed => feed.topic.id))]
  const hostnameIds = [
    ...new Set(
      feeds.flatMap(feed =>
        [feed.hostname?.id, feed.rss_feed_url?.hostname?.id].filter(
          (id): id is string => id !== undefined,
        ),
      ),
    ),
  ]

  const [topic_elections, hostname_elections] = await Promise.all([
    topicIds.length > 0
      ? getTopicElectionByIdCachedBatch(topicIds).then(indexById)
      : Promise.resolve({} as Record<string, ViewTopicElection>),
    hostnameIds.length > 0
      ? getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById)
      : Promise.resolve({} as Record<string, ViewHostnameElection>),
  ])

  const sidecars: RssFeedSidecars = { topic_elections, hostname_elections }

  if (currentUser) {
    const feedIds = feeds.map(feed => feed.id)
    const [votes, feedBookmarks, topicBookmarks] = await Promise.all([
      topicIds.length > 0
        ? getTopicElectionVotesByUser(currentUser.id, topicIds)
        : Promise.resolve([]),
      feedIds.length > 0
        ? getBookmarksForEntities(currentUser, 'rss_feed', feedIds)
        : Promise.resolve({}),
      topicIds.length > 0
        ? getBookmarksForEntities(currentUser, 'topic', topicIds)
        : Promise.resolve({}),
    ])
    // Feed and topic IDs are both UUIDs; collision risk is zero.
    const bookmarks = { ...feedBookmarks, ...topicBookmarks }
    if (votes.length > 0) {
      sidecars.election_votes = Object.fromEntries(votes.map(vote => [vote.entity_id, vote]))
    }
    if (Object.keys(bookmarks).length > 0) {
      sidecars.bookmarks = bookmarks
    }
  }

  return sidecars
}
