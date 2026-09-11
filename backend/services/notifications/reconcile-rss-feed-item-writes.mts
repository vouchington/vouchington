import type { PoolClient } from '@data-stores/psql'
import type { CreatedNotification } from './reconcile-batches.mts'
import { reconcileRssFeedItemContentNotificationVisibility } from './content-visibility-writes.mts'
import { truncateText } from './shared.mts'

export type RssFeedItemSnapshot = {
  rss_feed_item_id: string
  feed_name: string
  title: string
  description: string
  url: string
  deleted_at: Date | null
  is_content_eligible: boolean
}

export async function insertRssFeedItemNotificationsForRecipients(
  item: RssFeedItemSnapshot,
  recipientIds: string[],
  client: PoolClient,
  createdTable: string,
): Promise<CreatedNotification[]> {
  if (recipientIds.length === 0) return []

  const actorLabel = truncateText(item.feed_name, 100)
  const title = truncateText(`New item from ${item.feed_name}`, 300)
  const body = truncateText(item.title || item.description, 180)
  const { rows } = await client.query<CreatedNotification>(
    `/* insertRssFeedItemNotificationsForRecipients */
    WITH recipients AS (
      SELECT user_id
      FROM unnest($1::uuid[]) AS recipient(user_id)
    ),
    restored AS (
      UPDATE notifications
      SET deleted_at = NULL,
          delete_reason = NULL,
          title = $2,
          body = $3,
          actor_label = $4,
          target_path = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE rss_feed_item_id = $6
        AND delivery_type = 'subscription'
        AND deleted_at IS NOT NULL
        AND delete_reason = 'system_pruned'
        AND user_id IN (SELECT user_id FROM recipients)
      RETURNING user_id, id
    ),
    created AS (
      INSERT INTO notifications (
        user_id,
        entity_type,
        rss_feed_item_id,
        title,
        body,
        actor_label,
        target_path
      )
      SELECT
        recipients.user_id,
        'rss_feed_item',
        $6,
        $2,
        $3,
        $4,
        $5
      FROM recipients
      WHERE NOT EXISTS (
        SELECT 1
        FROM notifications
        WHERE rss_feed_item_id = $6
          AND user_id = recipients.user_id
          AND delivery_type = 'subscription'
          AND deleted_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM notifications
          WHERE rss_feed_item_id = $6
            AND user_id = recipients.user_id
            AND delivery_type = 'subscription'
            AND delete_reason = 'user_deleted'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM restored
          WHERE restored.user_id = recipients.user_id
        )
      ORDER BY recipients.user_id
      ON CONFLICT (user_id, rss_feed_item_id)
        WHERE rss_feed_item_id IS NOT NULL AND deleted_at IS NULL AND delivery_type = 'subscription'
        DO NOTHING
      RETURNING user_id, id
    ),
    inserted AS (
      INSERT INTO ${createdTable} (user_id, id)
      SELECT user_id, id
      FROM created
      -- no-mistakes: deadlock-safe -- random session-private temp table has no schema catalog entry.
      ORDER BY user_id, id
      RETURNING user_id, id
    )
    SELECT user_id, id
    FROM inserted
  `,
    [recipientIds, title, body, actorLabel, item.url, item.rss_feed_item_id],
  )

  return rows
}

export async function pruneRssFeedItemNotificationsExceptRecipients(
  rssFeedItemId: string,
  isContentEligible: boolean,
  client: PoolClient,
  recipientTable: string,
): Promise<number> {
  const prunedForContentVisibility = await reconcileRssFeedItemContentNotificationVisibility(
    rssFeedItemId,
    isContentEligible,
    client,
  )
  if (!isContentEligible) return prunedForContentVisibility

  const { rowCount } = await client.query(
    `/* pruneRssFeedItemNotificationsExceptRecipients */
    UPDATE notifications n
    SET deleted_at = CURRENT_TIMESTAMP,
        delete_reason = 'system_pruned'
    WHERE n.rss_feed_item_id = $1
      AND n.delivery_type = 'subscription'
      AND n.deleted_at IS NULL
      AND n.read_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ${recipientTable} recipients
        WHERE recipients.user_id = n.user_id
      )
  `,
    [rssFeedItemId],
  )
  return prunedForContentVisibility + (rowCount ?? 0)
}
