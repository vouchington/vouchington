import { transferCommunityOwnershipForUserPurge } from '../services/communities/ownership-transfer.mts'
import {
  insertTestRetentionTombstone,
  insertTestRetentionReceipt,
} from './auth-session-retention.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestPurgeCommunity(id: string) {
  const { rows } = await read<{
    id: string
    created_by_id: string
    archived_at: Date | null
    deleted_at: Date | null
  }>(sql`/* getTestPurgeCommunity */
    SELECT id, created_by_id, archived_at, deleted_at FROM communities WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function setTestPurgeCommunityLifecycle(
  id: string,
  lifecycle: 'archived' | 'deleted',
): Promise<void> {
  await write(sql`/* setTestPurgeCommunityLifecycle */
    UPDATE communities SET archived_at = CASE WHEN ${lifecycle} = 'archived' THEN CURRENT_TIMESTAMP ELSE archived_at END,
      deleted_at = CASE WHEN ${lifecycle} = 'deleted' THEN CURRENT_TIMESTAMP ELSE deleted_at END
    WHERE id = ${id}`)
}

export async function createTestUserPurgeCascadeRows(
  userId: string,
  postId: string,
  itemId: string,
): Promise<string> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`/* createTestUserPurgeCascadeRows:list */
    INSERT INTO user_lists (owner_user_id, name, created_via, removed_at)
    VALUES (${userId}, 'Removed purge fixture', 'system', CURRENT_TIMESTAMP) RETURNING id`)
  const id = rows[0]!.id
  await query(sql`/* createTestUserPurgeCascadeRows:posts */
    INSERT INTO user_list_posts (user_list_id, post_id, removed_at)
    VALUES (${id}, ${postId}, NULL), (${id}, ${postId}, CURRENT_TIMESTAMP)`)
  await query(sql`/* createTestUserPurgeCascadeRows:items */
    INSERT INTO user_list_rss_feed_items (user_list_id, rss_feed_item_id, removed_at)
    VALUES (${id}, ${itemId}, NULL), (${id}, ${itemId}, CURRENT_TIMESTAMP)`)
  const { rows: notifications } = await query<{
    id: string
  }>(sql`/* createTestUserPurgeCascadeRows:notifications */
    INSERT INTO notifications (user_id, entity_type, delivery_type, sent_by_id, post_id, title, body, target_path)
    SELECT ${userId}, 'post', 'manual_send', ${userId}, ${postId}, 'Purge fixture', 'Owned notification', '/discussion/' || ${postId}
    FROM generate_series(1, 2) RETURNING id`)
  const subscriptionId = await insertTestRetentionTombstone(query, userId, new Date())
  for (const notification of notifications) {
    await insertTestRetentionReceipt(query, userId, notification.id, subscriptionId)
  }
  await query.commit()
  return id
}

export async function getTestUserPurgeRemainingRows(
  userId: string,
  listId: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* getTestUserPurgeRemainingRows */
    SELECT (
      (SELECT count(*) FROM community_members WHERE user_id = ${userId} AND role = 'owner' AND removed_at IS NULL) +
      (SELECT count(*) FROM community_members WHERE user_id = ${userId}) +
      (SELECT count(*) FROM notifications WHERE user_id = ${userId}) +
      (SELECT count(*) FROM notification_push_intents WHERE user_id = ${userId}) +
      (SELECT count(*) FROM notification_push_intent_subscription_receipts WHERE user_id = ${userId}) +
      (SELECT count(*) FROM user_lists WHERE owner_user_id = ${userId}) +
      (SELECT count(*) FROM user_list_posts WHERE user_list_id = ${listId}) +
      (SELECT count(*) FROM user_list_rss_feed_items WHERE user_list_id = ${listId})
    )::integer AS count`)
  return rows[0]!.count
}

/** A rejected lifecycle probe must leave its caller-owned PostgreSQL transaction usable. */
export async function attemptTestPurgeOwnershipTransfer(
  communityId: string,
  fromUserId: string,
  toUserId: string,
) {
  await using query = await beginTransaction()
  const { rows } = await query<{
    id: string
    name: string
    slug: string
  }>(sql`/* attemptTestPurgeOwnershipTransfer:community */
    SELECT id, name, slug FROM communities WHERE id = ${communityId}`)
  const effect = await transferCommunityOwnershipForUserPurge(query, rows[0]!, fromUserId, toUserId)
  const { rows: members } = await query<{
    role: string
  }>(sql`/* attemptTestPurgeOwnershipTransfer:afterProbe */
    SELECT role FROM community_members WHERE community_id = ${communityId} AND user_id = ${fromUserId} AND removed_at IS NULL`)
  await query.commit()
  if (effect) await effect()
  return { accepted: effect !== null, formerRole: members[0]?.role }
}
