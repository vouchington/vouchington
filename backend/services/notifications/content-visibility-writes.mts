import { writePool, type PoolClient } from '@data-stores/psql'

export function pruneMissingPostContentNotifications(postId: string): Promise<number> {
  return withWriteClient(client =>
    reconcilePostContentNotificationVisibility(postId, false, false, client),
  )
}

export function pruneMissingRssFeedItemContentNotifications(
  rssFeedItemId: string,
): Promise<number> {
  return withWriteClient(client =>
    reconcileRssFeedItemContentNotificationVisibility(rssFeedItemId, false, client),
  )
}

/**
 * Applies the canonical-content visibility transition independently of subscription membership.
 * Manual sends are snapshots, so only this transition may hide or restore them.
 */
export async function reconcilePostContentNotificationVisibility(
  postId: string,
  isContentEligible: boolean,
  isManualSendContentEligible: boolean,
  client: PoolClient,
): Promise<number> {
  if (isManualSendContentEligible) {
    await restoreSystemPrunedManualPostNotifications(postId, client)
  }

  const { rowCount } = await client.query(
    `/* pruneIneligiblePostContentNotifications */
      UPDATE notifications notification
      SET deleted_at = CURRENT_TIMESTAMP,
          delete_reason = 'system_pruned'
      WHERE notification.publication_post_id = $1
        AND notification.entity_type = 'post'
        AND (
          notification.delivery_type = 'manual_send'
          OR notification.target_path ~ '^/(posts|reviews|data-points|link|discussion|review|data-point)/'
        )
        AND notification.deleted_at IS NULL
        AND (
          (notification.delivery_type = 'subscription' AND NOT $2::boolean)
          OR (notification.delivery_type = 'manual_send' AND NOT $3::boolean)
        )`,
    [postId, isContentEligible, isManualSendContentEligible],
  )
  return rowCount ?? 0
}

export async function reconcileRssFeedItemContentNotificationVisibility(
  rssFeedItemId: string,
  isContentEligible: boolean,
  client: PoolClient,
): Promise<number> {
  if (isContentEligible) {
    await restoreSystemPrunedManualRssFeedItemNotifications(rssFeedItemId, client)
    return 0
  }

  const { rowCount } = await client.query(
    `/* pruneIneligibleRssFeedItemContentNotifications */
      UPDATE notifications notification
      SET deleted_at = CURRENT_TIMESTAMP,
          delete_reason = 'system_pruned'
      WHERE notification.publication_rss_feed_item_id = $1
        AND notification.entity_type = 'rss_feed_item'
        AND notification.deleted_at IS NULL`,
    [rssFeedItemId],
  )
  return rowCount ?? 0
}

async function restoreSystemPrunedManualPostNotifications(
  postId: string,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `/* restoreSystemPrunedManualPostNotifications */
      UPDATE notifications notification
      SET deleted_at = NULL,
          delete_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE notification.publication_post_id = $1
        AND notification.entity_type = 'post'
        AND notification.delivery_type = 'manual_send'
        AND notification.deleted_at IS NOT NULL
        AND notification.delete_reason = 'system_pruned'`,
    [postId],
  )
}

async function restoreSystemPrunedManualRssFeedItemNotifications(
  rssFeedItemId: string,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `/* restoreSystemPrunedManualRssFeedItemNotifications */
      UPDATE notifications notification
      SET deleted_at = NULL,
          delete_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE notification.publication_rss_feed_item_id = $1
        AND notification.entity_type = 'rss_feed_item'
        AND notification.delivery_type = 'manual_send'
        AND notification.deleted_at IS NOT NULL
        AND notification.delete_reason = 'system_pruned'`,
    [rssFeedItemId],
  )
}

async function withWriteClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await writePool.connect()
  try {
    return await operation(client)
  } finally {
    client.release()
  }
}
