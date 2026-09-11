import type { PrivateUser } from '@services/users/types'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { BookmarksById, PostFetchResult } from './types.mts'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
} from './get.mts'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'

const EMPTY_BOOKMARKS: BookmarksById = {}
const EMPTY_ELECTION_VOTES = new Map<string, ElectionVote>()

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

  const postBookmarksPromise = getBookmarksForEntities(currentUser, 'post', postIds)
  const creatorIds = [
    ...new Set(
      Object.values(entities).flatMap(post => (post.created_by_id ? [post.created_by_id] : [])),
    ),
  ] as string[]
  const creatorBookmarksPromise =
    creatorIds.length > 0
      ? getBookmarksForEntities(currentUser, 'user', creatorIds)
      : Promise.resolve(EMPTY_BOOKMARKS)

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

  const [postBookmarks, creatorBookmarks, electionVotes] = await Promise.all([
    postBookmarksPromise,
    creatorBookmarksPromise,
    electionVotesPromise,
  ])

  const bookmarks = { ...creatorBookmarks, ...postBookmarks }
  const election_votes = electionVotesMapToRecord(electionVotes)

  return {
    entities,
    entity_metrics,
    post_elections,
    ...(Object.keys(bookmarks).length > 0 && { bookmarks }),
    ...(Object.keys(election_votes).length > 0 && { election_votes }),
  }
}
