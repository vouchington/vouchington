import type { PoolClient } from '@data-stores/psql'
import {
  type ReconcileNotificationsOptions,
  type RecipientPage,
  reconcileNotificationBatches,
} from './reconcile-batches.mts'
import {
  insertRssFeedItemNotificationsForRecipients,
  pruneRssFeedItemNotificationsExceptRecipients,
  type RssFeedItemSnapshot,
} from './reconcile-rss-feed-item-writes.mts'
import { reconcileRssFeedItemContentNotificationVisibility } from './content-visibility-writes.mts'
import { getRssFeedItemNotificationSnapshot } from './reconcile-rss-feed-item-snapshot.mts'
export async function reconcileNotificationsForRssFeedItem(
  rssFeedItemId: string,
  options: ReconcileNotificationsOptions = {},
) {
  const item = await getRssFeedItemNotificationSnapshot(rssFeedItemId)
  if (!item) {
    const visibility = await reconcileRssFeedItemContentNotificationVisibility(rssFeedItemId)
    return {
      created: 0,
      pruned: visibility.pruned,
      nextVisibilityCursor: visibility.nextCursor,
    }
  }
  const reconciled = await reconcileNotificationBatches(
    {
      batchQueryComment: 'selectRssFeedItemNotificationRecipientBatch',
      createRecipients: (client, recipientTable, page) =>
        populateRssFeedItemNotificationRecipients(client, recipientTable, item, page),
      insertBatch: (client, recipientIds, createdTable) =>
        insertRssFeedItemNotificationsForRecipients(item, recipientIds, client, createdTable),
      prune: (client, recipientTable, range) =>
        pruneRssFeedItemNotificationsExceptRecipients(
          item.rss_feed_item_id,
          item.is_content_eligible,
          client,
          recipientTable,
          range,
        ),
    },
    options,
  )
  if (options.afterUserId) return reconciled
  const visibility = await reconcileRssFeedItemContentNotificationVisibility(rssFeedItemId)
  return {
    ...reconciled,
    pruned: reconciled.pruned + visibility.pruned,
    nextVisibilityCursor: visibility.nextCursor,
  }
}
async function populateRssFeedItemNotificationRecipients(
  client: PoolClient,
  recipientTable: string,
  item: RssFeedItemSnapshot,
  page: RecipientPage,
): Promise<void> {
  if (!item.is_content_eligible) return

  await client.query(
    `/* populateRssFeedItemNotificationRecipients */
    WITH item AS (
      SELECT
        id,
        CASE
          WHEN isfinite(published_at) AND published_at >= TIMESTAMPTZ '1970-01-01' THEN published_at
          WHEN isfinite(created_at) THEN created_at
          ELSE CURRENT_TIMESTAMP
        END AS notification_at
      FROM rss_feed_items
      WHERE id = $1
    ),
    topic_matches AS (
      SELECT topic_id
      FROM rss_feed_item_categories
      WHERE rss_feed_item_id = $1
        AND topic_id IS NOT NULL
      UNION
      SELECT object_id AS topic_id
      FROM relation__rss_feed_item__category__topic
      WHERE subject_id = $1
        AND deleted_at IS NULL
        AND votes_score_net > 0
    ),
    recipients AS (
      SELECT rel.subject_id AS user_id
      FROM rss_feed_item_sources src
      JOIN item ON item.id = src.rss_feed_item_id
      JOIN relation__user__subscribe__rss_feed rel ON rel.object_id = src.rss_feed_id
      WHERE src.rss_feed_item_id = $1
        AND rel.created_at <= item.notification_at
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > item.notification_at
        )
      UNION
      SELECT rel.subject_id AS user_id
      FROM relation__user__subscribe_rss_feed_items__topic rel
      JOIN topic_matches ON topic_matches.topic_id = rel.object_id
      CROSS JOIN item
      WHERE rel.created_at <= item.notification_at
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > item.notification_at
        )
    )
    INSERT INTO ${recipientTable} (user_id)
    SELECT DISTINCT user_id
    FROM recipients
    WHERE user_id IS NOT NULL
      AND ($2::uuid IS NULL OR user_id > $2)
    -- no-mistakes: deadlock-safe -- random session-private temp table has no schema catalog entry.
    ORDER BY user_id
    LIMIT $3
    ON CONFLICT (user_id) DO NOTHING
  `,
    [item.rss_feed_item_id, page.afterUserId, page.limit],
  )
}
