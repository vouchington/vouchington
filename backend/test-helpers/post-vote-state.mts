import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Seeds the current-state row for the latest ballot in an owned post/user pair. */
export async function seedTestCurrentPostVote(
  userId: string,
  postId: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* seedTestCurrentPostVote */
    INSERT INTO post_vote_states (
      post_id, user_id, id, score, score_is_neutral, score_is_semantic,
      outbound_activitypub_like_activity_id
    )
    SELECT post_id, user_id, id, score, score_is_neutral, score_is_semantic,
      outbound_activitypub_like_activity_id
    FROM post_votes
    WHERE post_id = ${postId}::uuid AND user_id = ${userId}::uuid
    ORDER BY id DESC
    LIMIT 1
    ON CONFLICT (post_id, user_id) DO UPDATE SET
      id = EXCLUDED.id,
      score = EXCLUDED.score,
      score_is_neutral = EXCLUDED.score_is_neutral,
      score_is_semantic = EXCLUDED.score_is_semantic,
      outbound_activitypub_like_activity_id = EXCLUDED.outbound_activitypub_like_activity_id
    WHERE post_vote_states.id < EXCLUDED.id
  `)
}
