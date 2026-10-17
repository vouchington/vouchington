import type { PrivateUser } from '@services/users/types'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { PostFetchResult } from './types.mts'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
} from './get.mts'
import { getBookmarksForEntityGroups } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'

const EMPTY_ELECTION_VOTES = new Map<string, ElectionVote>()

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export async function fetchPostsWithMetadata(
  postIds: string[],
  currentUser?: PrivateUser | null,
): Promise<PostFetchResult> {
  if (postIds.length === 0) {
    return {
      entities: {},
      entity_metrics: {},
      post_elections: {},
    }
  }

  const [posts, postMetrics, postElections] = await Promise.all([
    getPostByAnyCachedBatch(postIds),
    getPostMetricsByAnyCachedBatch(postIds),
    getPostElectionByIdCachedBatch(postIds).then(indexById),
  ])

  const entities = indexById(posts)
  const entity_metrics = indexById(postMetrics)
  const post_elections = postElections

  if (!currentUser) {
    return {
      entities,
      entity_metrics,
      post_elections,
    }
  }

  const creatorIds = [
    ...new Set(
      Object.values(entities).flatMap(post => (post.created_by_id ? [post.created_by_id] : [])),
    ),
  ] as string[]
  const bookmarksPromise = getBookmarksForEntityGroups(currentUser, [
    { entityTypeName: 'post', entities: postIds },
    { entityTypeName: 'user', entities: creatorIds },
  ])

  const electionVotesPromise =
    postIds.length > 0
      ? getPostElectionVotesByUser(currentUser.id, postIds).then(votes => {
          const map = new Map<string, ElectionVote>()
          for (const vote of votes) {
            map.set(vote.entity_id, vote)
          }
          return map
        })
      : Promise.resolve(EMPTY_ELECTION_VOTES)

  const [bookmarks, electionVotes] = await Promise.all([bookmarksPromise, electionVotesPromise])

  const election_votes = electionVotesMapToRecord(electionVotes)

  return {
    entities,
    entity_metrics,
    post_elections,
    ...(Object.keys(bookmarks).length > 0 && { bookmarks }),
    ...(Object.keys(election_votes).length > 0 && { election_votes }),
  }
}
