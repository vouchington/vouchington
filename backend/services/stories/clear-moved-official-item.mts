import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Match the official-item FK's deletion behavior; an admin lock still prevents agent override. */
export async function clearMovedStoryOfficialItem(
  query: TransactionQuery,
  storyId: string | null,
  itemId: string,
): Promise<void> {
  if (!storyId) return
  await query(sql`/* clearMovedStoryOfficialItem */
    UPDATE stories SET official_rss_feed_item_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${storyId} AND official_rss_feed_item_id = ${itemId} AND deleted_at IS NULL
  `)
}
