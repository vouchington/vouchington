import type { PrivateUser } from '@services/users/types'
import type { ViewRssFeed } from './types.mts'
import {
  getTopicElectionVotesByUser,
  type ViewTopicElection,
} from '@services/elections-votes/topic'
import type { ElectionVote } from '@services/elections-votes/shared'
import { getBookmarkMapsForEntityGroups } from '@services/bookmarks/get'
import type { ViewHostnameElection } from '@services/elections-votes/hostname'
import { getCachedElectionGroups } from '@services/elections-votes/shared/cached-groups'
import { indexById } from '@modules/utils'

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
 * Fetches topic elections, hostname elections, and — for an authenticated viewer — votes and
 * bookmarks in one parallel batch. Votes and bookmarks do not depend on the election rows.
 * The optional fields are omitted when empty so the response shape matches the documented
 * contract: "Both are omitted for anonymous viewers and when there is no relevant data."
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
  const feedIds = feeds.map(feed => feed.id)

  const [elections, votes, bookmarkMaps] = await Promise.all([
    getCachedElectionGroups({ topic: topicIds, hostname: hostnameIds }),
    currentUser && topicIds.length > 0
      ? getTopicElectionVotesByUser(currentUser.id, topicIds)
      : Promise.resolve([]),
    currentUser
      ? getBookmarkMapsForEntityGroups(currentUser, [
          { entityTypeName: 'rss_feed', entities: feedIds },
          { entityTypeName: 'topic', entities: topicIds },
        ])
      : Promise.resolve([{}, {}]),
  ])

  const sidecars: RssFeedSidecars = {
    topic_elections: indexById(elections.topic),
    hostname_elections: indexById(elections.hostname),
  }

  if (currentUser) {
    const [feedBookmarks, topicBookmarks] = bookmarkMaps
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
