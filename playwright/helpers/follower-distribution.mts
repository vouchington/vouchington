import { read } from '../../backend/data-stores/psql/clients.mts'

export async function findLatestFollowerDistributionId(
  senderUserId: string,
  action: 'post_share' | 'post_send',
  postId: string,
): Promise<string | undefined> {
  const { rows } = await read<{ id: string }>(
    `/* playwright findLatestFollowerDistributionId */
     SELECT id
     FROM follower_distributions
     WHERE sender_user_id = $1
       AND action = $2
       AND post_id = $3
     ORDER BY id DESC
     LIMIT 1`,
    [senderUserId, action, postId],
  )
  return rows[0]?.id
}

export async function countPostFeedShares(
  recipientUserId: string,
  sharedById: string,
  postId: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* playwright countPostFeedShares */
     SELECT COUNT(*)::INT AS count
     FROM post_feed_shares
     WHERE recipient_user_id = $1
       AND shared_by_id = $2
       AND post_id = $3`,
    [recipientUserId, sharedById, postId],
  )
  return rows[0]?.count ?? 0
}

export async function countManualSendNotifications(
  userId: string,
  sentById: string,
  postId: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* playwright countManualSendNotifications */
     SELECT COUNT(*)::INT AS count
     FROM notifications
     WHERE user_id = $1
       AND sent_by_id = $2
       AND post_id = $3
       AND delivery_type = 'manual_send'`,
    [userId, sentById, postId],
  )
  return rows[0]?.count ?? 0
}
