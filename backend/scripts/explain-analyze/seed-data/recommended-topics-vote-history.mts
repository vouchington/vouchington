import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const VOTE_HISTORY_USER_INDEX = 19_500
export const VOTE_HISTORY_USER_ID = seedUuid(VOTE_HISTORY_USER_INDEX, '01')
export const VOTE_HISTORY_POST_COUNT = 5_000
export const VOTE_HISTORY_REVOTE_COUNT = 500
export const VOTE_HISTORY_ROW_COUNT = VOTE_HISTORY_POST_COUNT + VOTE_HISTORY_REVOTE_COUNT

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
  const insert = `/* seedExplainData */ INSERT INTO post_votes (post_id, user_id, score)
    SELECT post_id, $2::uuid, $3::smallint FROM unnest($1::uuid[]) AS input(post_id)`
  await transaction(insert, [postIds, VOTE_HISTORY_USER_ID, 1])
  // The re-votes are newer than the first pass, so the latest vote per post flips these to
  // downvotes. Post 0 is the shared trending fixture's only positively voted post: keep it upvoted.
  const revoted = postIds.slice(1, VOTE_HISTORY_REVOTE_COUNT + 1)
  await transaction(insert, [revoted, VOTE_HISTORY_USER_ID, -1])
  await transaction.commit()
}
