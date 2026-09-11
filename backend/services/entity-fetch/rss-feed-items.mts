import type { PrivateUser } from '@services/users/types'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { RssFeedItemFetchResult } from './types.mts'
import { getRssFeedItemByIdCachedBatch, getRssFeedItemElectionByIdCachedBatch } from './get.mts'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getRssFeedItemElectionVotesByUser } from '@services/elections-votes/rss-feed-item'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'

export async function fetchRssFeedItemsWithMetadata(
  rssFeedItemIds: string[],
  currentUser?: PrivateUser | null,
): Promise<RssFeedItemFetchResult> {
  if (rssFeedItemIds.length === 0) {
    return {
      entities: {},
      entity_metrics: {},
      rss_feed_item_elections: {},
    }
  }

  const [items, rss_feed_item_elections] = await Promise.all([
    getRssFeedItemByIdCachedBatch(rssFeedItemIds),
    getRssFeedItemElectionByIdCachedBatch(rssFeedItemIds).then(indexById),
  ])
  const entities = indexById(items)

  if (!currentUser) {
    return {
      entities,
      entity_metrics: {},
      rss_feed_item_elections,
    }
  }

  const [bookmarks, electionVotesArray] = await Promise.all([
    rssFeedItemIds.length > 0
      ? getBookmarksForEntities(currentUser, 'rss_feed_item', rssFeedItemIds)
      : Promise.resolve({}),
    rssFeedItemIds.length > 0
      ? getRssFeedItemElectionVotesByUser(currentUser.id, rssFeedItemIds)
      : Promise.resolve([]),
  ])

  const electionVotes = new Map<string, ElectionVote>()
  for (const vote of electionVotesArray) {
    electionVotes.set(vote.entity_id, vote)
  }

  const election_votes = electionVotesMapToRecord(electionVotes)

  return {
    entities,
    entity_metrics: {},
    rss_feed_item_elections,
    ...(Object.keys(bookmarks).length > 0 && { bookmarks }),
    ...(Object.keys(election_votes).length > 0 && { election_votes }),
  }
}
