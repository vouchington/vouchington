import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteNotificationsForPostIds(postIds: string[]) {
  if (postIds.length === 0) return
  await write(sql`DELETE FROM notifications WHERE post_id = ANY(${postIds}::uuid[])`)
}

export async function deleteNotificationsForRssFeedItemIds(rssFeedItemIds: string[]) {
  if (rssFeedItemIds.length === 0) return
  await write(sql`
    DELETE FROM notifications
    WHERE rss_feed_item_id = ANY(${rssFeedItemIds}::uuid[])
  `)
}

export async function deleteNotificationsSentByUserIds(userIds: string[]) {
  if (userIds.length === 0) return
  await write(sql`
    DELETE FROM notifications
    WHERE sent_by_user_id = ANY(${userIds}::uuid[])
  `)
}

export async function getNotificationById(notificationId: string) {
  const { rows } = await read(sql`
    SELECT delivery_type, sent_by_user_id, post_id, rss_feed_item_id,
      publication_post_id, publication_rss_feed_item_id, read_at, pushed_at,
      deleted_at, delete_reason
    FROM notifications
    WHERE id = ${notificationId}::uuid
  `)

  return rows[0] as
    | {
        delivery_type: string
        sent_by_user_id: string | null
        post_id: string | null
        rss_feed_item_id: string | null
        publication_post_id: string | null
        publication_rss_feed_item_id: string | null
        read_at: Date | null
        pushed_at: Date | null
        deleted_at: Date | null
        delete_reason: string | null
      }
    | undefined
}

export async function markTestNotificationPushed(notificationId: string): Promise<void> {
  await write(sql`/* markTestNotificationPushed */
    UPDATE notifications
    SET pushed_at = CURRENT_TIMESTAMP
    WHERE id = ${notificationId}::uuid
  `)
}

export async function claimTestLegacyNotificationPush(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* claimTestLegacyNotificationPush */
    UPDATE notifications
    SET pushed_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND id = ${notificationId}
      AND deleted_at IS NULL
      AND pushed_at IS NULL
  `)
  return rowCount === 1
}

export async function expireTestNotificationPushIntentLease(
  userId: string,
  notificationId: string,
): Promise<void> {
  await write(sql`/* expireTestNotificationPushIntentLease */
    UPDATE notification_push_intents
    SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE user_id = ${userId} AND notification_id = ${notificationId}
  `)
}

export async function getTestNotificationPushIntent(userId: string, notificationId: string) {
  const { rows } = await read<{
    status: string
    suppressed_at: Date | null
    delivered_at: Date | null
  }>(sql`/* getTestNotificationPushIntent */
    SELECT status, suppressed_at, delivered_at
    FROM notification_push_intents
    WHERE user_id = ${userId} AND notification_id = ${notificationId}
  `)
  return rows[0]
}

export async function deleteTestNotificationPushIntent(
  userId: string,
  notificationId: string,
): Promise<void> {
  await write(sql`/* deleteTestNotificationPushIntent */
    DELETE FROM notification_push_intents
    WHERE user_id = ${userId}::uuid AND notification_id = ${notificationId}::uuid
  `)
}

export async function getTestNotificationPushReceipt(
  userId: string,
  notificationId: string,
  subscriptionId: string,
) {
  const { rows } = await read<{
    status: string
    delivered_at: Date | null
    permanently_failed_at: Date | null
  }>(sql`/* getTestNotificationPushReceipt */
    SELECT status, delivered_at, permanently_failed_at
    FROM notification_push_intent_subscription_receipts receipt
    WHERE receipt.user_id = ${userId}
      AND receipt.notification_id = ${notificationId}
      AND receipt.subscription_id = ${subscriptionId}::uuid
  `)
  return rows[0]
}

export async function getTestWebPushSubscription(userId: string, subscriptionId: string) {
  const { rows } = await read<{
    deleted_at: Date | null
    last_failure_at: Date | null
    last_success_at: Date | null
  }>(sql`/* getTestWebPushSubscription */
    SELECT deleted_at, last_failure_at, last_success_at
    FROM web_push_subscriptions subscription
    WHERE subscription.user_id = ${userId}
      AND subscription.id = ${subscriptionId}::uuid
  `)
  return rows[0]
}

export async function notificationPushIntentExists(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* notificationPushIntentExists */
    SELECT EXISTS (
      SELECT 1 FROM notification_push_intents
      WHERE user_id = ${userId}::uuid AND notification_id = ${notificationId}::uuid
    ) AS exists
  `)
  return rows[0]!.exists as boolean
}

export async function setTestNotificationPushIntentTerminalState(input: {
  userId: string
  notificationId: string
  status: 'delivered' | 'suppressed'
  terminalAt: Date
}): Promise<void> {
  await write(sql`/* setTestNotificationPushIntentTerminalState */
    UPDATE notification_push_intents
    SET status = ${input.status}::notification_push_intent_status,
        delivered_at = CASE WHEN ${input.status} = 'delivered' THEN ${input.terminalAt}::timestamptz ELSE NULL END,
        suppressed_at = CASE WHEN ${input.status} = 'suppressed' THEN ${input.terminalAt}::timestamptz ELSE NULL END
    WHERE user_id = ${input.userId}::uuid AND notification_id = ${input.notificationId}::uuid
  `)
}
export async function createTestManualPostNotification(input: {
  userId: string
  sentByUserId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestManualPostNotification */
    INSERT INTO notifications (
      user_id, entity_type, delivery_type, sent_by_user_id, post_id, title, body, target_path
    )
    VALUES (
      ${input.userId}, 'post', 'manual_send', ${input.sentByUserId}, ${input.postId},
      'Someone sent you a post', 'Test content notification', ${`/discussion/${input.postId}`}
    )
    RETURNING id
  `)
  return rows[0]!.id
}
export async function createTestManualRssFeedItemNotification(input: {
  userId: string
  sentByUserId: string
  rssFeedItemId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestManualRssFeedItemNotification */
    INSERT INTO notifications (
      user_id, entity_type, delivery_type, sent_by_user_id, rss_feed_item_id, title, body, target_path
    )
    VALUES (
      ${input.userId}, 'rss_feed_item', 'manual_send', ${input.sentByUserId}, ${input.rssFeedItemId},
      'Someone sent you an article', 'Test content notification', 'https://example.com/test'
    )
    RETURNING id
  `)
  return rows[0]!.id
}
