import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function setRssFeedItemShareSortAtForTest({
  recipientUserId,
  rssFeedItemId,
  sharedByUserId,
  sortAt,
}: {
  recipientUserId: string
  rssFeedItemId: string
  sharedByUserId: string
  sortAt: Date | string
}): Promise<void> {
  await write(sql`/* setRssFeedItemShareSortAtForTest */
    UPDATE rss_feed_item_feed_shares
    SET sort_at = ${sortAt}::timestamptz
    WHERE recipient_user_id = ${recipientUserId}
      AND rss_feed_item_id = ${rssFeedItemId}
      AND shared_by_id = ${sharedByUserId}
  `)
}
