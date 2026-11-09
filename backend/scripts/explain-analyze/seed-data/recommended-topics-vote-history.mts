import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { buildPostVoteStateSeedSql } from './post-vote-state.mts'

export const VOTE_HISTORY_USER_INDEX = 19_500
export const VOTE_HISTORY_USER_ID = seedUuid(VOTE_HISTORY_USER_INDEX, '01')
export const VOTE_HISTORY_POST_COUNT = 5_000
export const VOTE_HISTORY_REVOTE_COUNT = 500

// Posts 0..49,999 carry a post->topic relation (seedEntityRelations), so each vote reaches topics.
const POST_STRIDE = 7
const RELATED_POST_COUNT = 50_000
const BATCH_SIZE = 500

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
  // The re-votes are newer than the first pass, so the latest ballot per post flips these to
  // downvotes. Post 0 is the shared trending fixture's only positively voted post: keep it upvoted.
  const revoted = postIds.slice(1, VOTE_HISTORY_REVOTE_COUNT + 1)
  for (const [ids, score] of [
    [postIds, 1],
    [revoted, -1],
  ] as const) {
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE)
      const rows = batch.map((_, index) => `($${index + 1}, $${batch.length + 1}, ${score})`)
      await transaction(buildPostVoteStateSeedSql(rows.join(', ')), [
        ...batch,
        VOTE_HISTORY_USER_ID,
      ])
    }
  }
  await transaction.commit()
}
