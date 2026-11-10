import { beginTransaction } from '@data-stores/psql'
import {
  VOTE_HISTORY_POST_COUNT,
  VOTE_HISTORY_REVOTE_COUNT,
} from '../post-vote-state-scenario-ids.mts'
import { seedUuid } from './common.mts'
import { buildPostVoteStateSeedSql } from './post-vote-state.mts'

export const VOTE_HISTORY_USER_INDEX = 19_500
export const VOTE_HISTORY_USER_ID = seedUuid(VOTE_HISTORY_USER_INDEX, '01')

// Posts 0..49,999 carry a post->topic relation (seedEntityRelations), so each vote reaches topics.
const POST_STRIDE = 7
const RELATED_POST_COUNT = 50_000

/**
 * One viewer with far more post votes than the default recommended-topics window, including
 * re-votes, so the newest-N read must bound the history and still keep the latest vote per post.
 */
export async function seedRecommendedTopicsVoteHistory(): Promise<void> {
  console.log(`Seeding a ${VOTE_HISTORY_POST_COUNT}-post vote history for one viewer...`)
  const postIds = Array.from({ length: VOTE_HISTORY_POST_COUNT }, (_, index) =>
    seedUuid((index * POST_STRIDE) % RELATED_POST_COUNT, '05'),
  )
  await using transaction = await beginTransaction()
  const castVotes = (ids: readonly string[], score: number) =>
    transaction(
      buildPostVoteStateSeedSql(
        ids.map((_, index) => `($${index + 1}, $${ids.length + 1}, ${score})`).join(', '),
      ),
      [...ids, VOTE_HISTORY_USER_ID],
    )
  await castVotes(postIds, 1)
  // The re-votes are newer than the first pass, so the latest ballot per post flips these to
  // downvotes. Post 0 is the shared trending fixture's only positively voted post: keep it upvoted.
  await castVotes(postIds.slice(1, VOTE_HISTORY_REVOTE_COUNT + 1), -1)
  await transaction.commit()
}
