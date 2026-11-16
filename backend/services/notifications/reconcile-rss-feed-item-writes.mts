import type { PoolClient } from '@data-stores/psql'
import type { CreatedNotification } from './reconcile-batches.mts'

export type RssFeedItemSnapshot = {
  rss_feed_item_id: string
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
          target_path = $2
      WHERE rss_feed_item_id = $3
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
        kind,
        rss_feed_item_id,
        target_path
      )
      SELECT
        recipients.user_id,
        'rss_feed_item',
        'rss_item_new',
        $3,
        $2
      FROM recipients
      WHERE NOT EXISTS (
        SELECT 1
        FROM notifications
        WHERE rss_feed_item_id = $3
          AND user_id = recipients.user_id
          AND delivery_type = 'subscription'
          AND deleted_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM notifications
          WHERE rss_feed_item_id = $3
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
    [recipientIds, item.url, item.rss_feed_item_id],
  )

  return rows
}
