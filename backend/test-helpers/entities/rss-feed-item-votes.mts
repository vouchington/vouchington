/**
 * RSS feed item vote entity helpers
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert RSS feed item vote by rss_feed_item UUID.
 */
export async function insertRssFeedItemVote(
  userId: string,
  rssFeedItemId: string,
  score: number,
  id?: string,
  scoreIsNeutral = false,
  scoreIsSemantic = false,
): Promise<void> {
  await write(sql`/* insertRssFeedItemVote */
    INSERT INTO rss_feed_item_votes (id, user_id, rss_feed_item_id, score, score_is_neutral, score_is_semantic)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${userId}, ${rssFeedItemId}, ${score}, ${scoreIsNeutral}, ${scoreIsSemantic})
  `)
}
