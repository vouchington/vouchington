import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setRssFeedItemShareSortAtForTest({
  recipientUserId,
  rssFeedItemId,
  sharedByUserId,
  sortAt,
}: {
  recipientUserId: string
  rssFeedItemId: string
  sharedByUserId: string
  sortAt: Date
}): Promise<void> {
  await write(sql`/* setRssFeedItemShareSortAtForTest */
    UPDATE rss_feed_item_feed_shares
    SET sort_at = ${sortAt}
    WHERE recipient_user_id = ${recipientUserId}
      AND rss_feed_item_id = ${rssFeedItemId}
      AND shared_by_user_id = ${sharedByUserId}
  `)
}
