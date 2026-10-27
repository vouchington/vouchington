import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Drain one child table page before removing its list parent, including soft-removed rows. */
export async function cleanupUserListRows(
  query: TransactionQuery,
  userId: string,
  limit: number,
): Promise<number> {
  const { rows } = await query<{ id: string }>(sql`/* cleanupUserListRows:list */
    SELECT id FROM user_lists WHERE owner_user_id = ${userId} ORDER BY id LIMIT 1 FOR UPDATE`)
  const list = rows[0]
  if (!list) return 0
  const posts = await query(sql`/* cleanupUserListRows:posts */
    WITH candidates AS (SELECT id FROM user_list_posts WHERE user_list_id = ${list.id}
      ORDER BY id LIMIT ${limit} FOR UPDATE)
    DELETE FROM user_list_posts WHERE id IN (SELECT id FROM candidates)`)
  if (posts.rowCount) return posts.rowCount
  const items = await query(sql`/* cleanupUserListRows:feedItems */
    WITH candidates AS (SELECT id FROM user_list_rss_feed_items WHERE user_list_id = ${list.id}
      ORDER BY id LIMIT ${limit} FOR UPDATE)
    DELETE FROM user_list_rss_feed_items WHERE id IN (SELECT id FROM candidates)`)
  if (items.rowCount) return items.rowCount
  const deleted = await query(sql`/* cleanupUserListRows:deleteList */
    DELETE FROM user_lists WHERE id = ${list.id}`)
  return deleted.rowCount ?? 0
}

export async function cleanupUserNotifications(
  query: TransactionQuery,
  userId: string,
  limit: number,
): Promise<number> {
  const { rowCount } = await query(sql`/* cleanupUserNotifications */
    WITH candidates AS (SELECT id FROM notifications WHERE user_id = ${userId}
      ORDER BY id LIMIT ${limit} FOR UPDATE)
    DELETE FROM notifications WHERE user_id = ${userId} AND id IN (SELECT id FROM candidates)`)
  return rowCount ?? 0
}

export async function cleanupUserCommunityMemberships(
  query: TransactionQuery,
  userId: string,
  limit: number,
): Promise<number> {
  const { rowCount } = await query(sql`/* cleanupUserCommunityMemberships */
    WITH candidates AS (SELECT id FROM community_members WHERE user_id = ${userId}
      ORDER BY id LIMIT ${limit} FOR UPDATE)
    DELETE FROM community_members WHERE id IN (SELECT id FROM candidates)`)
  return rowCount ?? 0
}

export async function cleanupUserNotificationPushReceipts(
  query: TransactionQuery,
  userId: string,
  limit: number,
): Promise<number> {
  const { rowCount } = await query(sql`/* cleanupUserNotificationPushReceipts */
    WITH candidates AS (SELECT notification_id, subscription_id FROM notification_push_intent_subscription_receipts
      WHERE user_id = ${userId} ORDER BY notification_id, subscription_id LIMIT ${limit} FOR UPDATE)
    DELETE FROM notification_push_intent_subscription_receipts
    WHERE user_id = ${userId} AND (notification_id, subscription_id) IN (SELECT notification_id, subscription_id FROM candidates)`)
  return rowCount ?? 0
}

export async function cleanupUserNotificationPushIntents(
  query: TransactionQuery,
  userId: string,
  limit: number,
): Promise<number> {
  const { rowCount } = await query(sql`/* cleanupUserNotificationPushIntents */
    WITH candidates AS (SELECT notification_id FROM notification_push_intents
      WHERE user_id = ${userId} ORDER BY notification_id LIMIT ${limit} FOR UPDATE)
    DELETE FROM notification_push_intents WHERE user_id = ${userId} AND notification_id IN (SELECT notification_id FROM candidates)`)
  return rowCount ?? 0
}
