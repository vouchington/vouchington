import { type PoolClient, write } from '@data-stores/psql'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'
import sql from 'sql-template-strings'
import {
  type ReconcileNotificationsOptions,
  reconcileNotificationBatches,
} from './reconcile-batches.mts'
import {
  insertRssFeedItemNotificationsForRecipients,
  pruneRssFeedItemNotificationsExceptRecipients,
  type RssFeedItemSnapshot,
} from './reconcile-rss-feed-item-writes.mts'
import { pruneMissingRssFeedItemContentNotifications } from './content-visibility-writes.mts'
export async function reconcileNotificationsForRssFeedItem(
  rssFeedItemId: string,
  options: ReconcileNotificationsOptions = {},
) {
  const item = await getRssFeedItemNotificationSnapshot(rssFeedItemId)
  if (!item)
    return {
      created: 0,
      pruned: await pruneMissingRssFeedItemContentNotifications(rssFeedItemId),
    }
  return await reconcileNotificationBatches(
    {
      batchQueryComment: 'selectRssFeedItemNotificationRecipientBatch',
      createRecipients: (client, recipientTable) =>
        populateRssFeedItemNotificationRecipients(client, recipientTable, item),
      insertBatch: (client, recipientIds, createdTable) =>
        insertRssFeedItemNotificationsForRecipients(item, recipientIds, client, createdTable),
      prune: (client, recipientTable) =>
        pruneRssFeedItemNotificationsExceptRecipients(
          item.rss_feed_item_id,
          item.is_content_eligible,
          client,
          recipientTable,
        ),
    },
    options,
  )
}
async function getRssFeedItemNotificationSnapshot(
  rssFeedItemId: string,
): Promise<RssFeedItemSnapshot | null> {
  const query = sql`/* getRssFeedItemNotificationSnapshot */
    SELECT
      rss_feed_items.id AS rss_feed_item_id,
      COALESCE(rss_feeds.title, urls.url, 'RSS Feed') AS feed_name,
      COALESCE(
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'title', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        'New RSS Feed Item'
      ) AS title,
      COALESCE(
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'contentSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        ''
      ) AS description,
      urls.url,
      rss_feed_items.deleted_at,
      (rss_feed_items.deleted_at IS NULL AND `
  query.append(itemHasDiscoverableSourceSql('rss_feed_items.id'))
    .append(sql`) AS is_content_eligible
    FROM rss_feed_items
    JOIN rss_feed_item_sources ON rss_feed_item_sources.rss_feed_item_id = rss_feed_items.id
    JOIN rss_feeds ON rss_feeds.id = rss_feed_item_sources.rss_feed_id
    JOIN urls ON urls.id = rss_feed_items.url_id
    WHERE rss_feed_items.id = ${rssFeedItemId}
    ORDER BY rss_feed_item_sources.created_at ASC
    LIMIT 1
  `)
  const { rows } = await write(query)
  return (rows[0] as RssFeedItemSnapshot | undefined) ?? null
}
async function populateRssFeedItemNotificationRecipients(
  client: PoolClient,
  recipientTable: string,
  item: RssFeedItemSnapshot,
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
    -- no-mistakes: deadlock-safe -- random session-private temp table has no schema catalog entry.
    ORDER BY user_id
    ON CONFLICT (user_id) DO NOTHING
  `,
    [item.rss_feed_item_id],
  )
}
