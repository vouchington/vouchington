import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertPostFeedShareForTest(params: {
  recipientUserId: string
  sharedByUserId: string
  postId: string
  sortAt?: Date
}): Promise<string> {
  const id = uuidv7()
  await write(sql`/* insertPostFeedShareForTest */
    INSERT INTO post_feed_shares (recipient_user_id, id, shared_by_user_id, post_id, sort_at)
    VALUES (${params.recipientUserId}, ${id}, ${params.sharedByUserId}, ${params.postId}, ${params.sortAt ?? new Date()})
  `)
  return id
}

export async function getPostShareRecipientIdsForTest(params: {
  sharedByUserId: string
  postId: string
}): Promise<string[]> {
  const { rows } = await read<{
    recipient_user_id: string
  }>(sql`/* getPostShareRecipientIdsForTest */
    SELECT recipient_user_id
    FROM post_feed_shares
    WHERE shared_by_user_id = ${params.sharedByUserId}
      AND post_id = ${params.postId}
    ORDER BY recipient_user_id
  `)
  return rows.map(row => row.recipient_user_id)
}

export async function getPostShareRowsForTest(params: {
  sharedByUserId: string
  postId: string
}): Promise<Array<{ recipient_user_id: string; shared_at: Date; sort_at: Date }>> {
  const { rows } = await read<{
    recipient_user_id: string
    shared_at: Date
    sort_at: Date
  }>(sql`/* getPostShareRowsForTest */
    SELECT
      recipient_user_id,
      created_at AS shared_at,
      sort_at
    FROM post_feed_shares
    WHERE shared_by_user_id = ${params.sharedByUserId}
      AND post_id = ${params.postId}
    ORDER BY recipient_user_id
  `)
  return rows
}

export async function getRssFeedItemShareRecipientIdsForTest(params: {
  sharedByUserId: string
  rssFeedItemId: string
}): Promise<string[]> {
  const { rows } = await read<{ recipient_user_id: string }>(
    sql`/* getRssFeedItemShareRecipientIdsForTest */
      SELECT recipient_user_id
      FROM rss_feed_item_feed_shares
      WHERE shared_by_user_id = ${params.sharedByUserId}
        AND rss_feed_item_id = ${params.rssFeedItemId}
      ORDER BY recipient_user_id
    `,
  )
  return rows.map(row => row.recipient_user_id)
}

export async function getManualSendNotificationRowsForTest(params: {
  sentByUserId: string
  postId?: string
  rssFeedItemId?: string
}): Promise<Array<{ user_id: string; title: string }>> {
  const query = sql`/* getManualSendNotificationRowsForTest */
    SELECT user_id, title
    FROM notifications
    WHERE sent_by_user_id = ${params.sentByUserId}
      AND delivery_type = 'manual_send'
  `
  if (params.postId) query.append(sql` AND post_id = ${params.postId}`)
  if (params.rssFeedItemId) query.append(sql` AND rss_feed_item_id = ${params.rssFeedItemId}`)
  query.append(sql` ORDER BY user_id`)
  const { rows } = await read<{ user_id: string; title: string }>(query)
  return rows
}
