import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { DistributionRow, ProcessTargetRowsResult } from './process-types.mts'
import {
  ensureDeliveryRows,
  getUnpushedNotificationsForDeliveries,
  markDistributionFailed,
} from './process-state.mts'

export async function insertRssFeedItemFeedShares(
  distribution: DistributionRow,
  recipientIds: string[],
  query: TransactionQuery,
): Promise<boolean> {
  const { rows } = await query(sql`/* insertRssFeedItemFeedShares:getItem */
	    SELECT id, published_at
	    FROM rss_feed_items
	    WHERE id = ${distribution.rss_feed_item_id}
	      AND deleted_at IS NULL
	  `)
  const item = rows[0] as { id: string; published_at: Date } | undefined
  if (!item) {
    await markDistributionFailed(distribution.id, 'RSS feed item not found', query)
    return false
  }

  await ensureDeliveryRows(distribution.id, recipientIds, query)
  await query(sql`/* insertRssFeedItemFeedShares */
    INSERT INTO rss_feed_item_feed_shares (
      recipient_user_id,
      id,
      shared_by_id,
      rss_feed_item_id,
      sort_at
    )
    SELECT
      deliveries.recipient_user_id,
      deliveries.delivery_id,
      ${distribution.sender_user_id},
      ${distribution.rss_feed_item_id},
      GREATEST(uuid_extract_timestamp(deliveries.delivery_id), ${item.published_at})
    FROM follower_distribution_deliveries deliveries
    WHERE deliveries.distribution_id = ${distribution.id}
      AND deliveries.recipient_user_id = ANY(${recipientIds}::uuid[])
    ORDER BY deliveries.recipient_user_id, deliveries.delivery_id
    ON CONFLICT (recipient_user_id, id) DO NOTHING
  `)
  return true
}

export async function insertRssFeedItemManualSendNotifications(
  distribution: DistributionRow,
  recipientIds: string[],
  query: TransactionQuery,
): Promise<ProcessTargetRowsResult> {
  const { rows } = await query(sql`/* insertRssFeedItemManualSendNotifications:getItem */
    SELECT
      rss_feed_items.id,
      urls.url
	    FROM rss_feed_items
	    JOIN urls ON urls.id = rss_feed_items.url_id
	    WHERE rss_feed_items.id = ${distribution.rss_feed_item_id}
	      AND rss_feed_items.deleted_at IS NULL
	  `)
  const item = rows[0] as { id: string; url: string } | undefined
  if (!item) {
    await markDistributionFailed(distribution.id, 'RSS feed item not found', query)
    return { failed: true, notificationsToDeliver: [] }
  }

  await ensureDeliveryRows(distribution.id, recipientIds, query)
  await query(sql`/* insertRssFeedItemManualSendNotifications */
    INSERT INTO notifications (
      user_id,
      id,
      entity_type,
      kind,
      delivery_type,
      sent_by_id,
      rss_feed_item_id,
      target_path
    )
    SELECT
      deliveries.recipient_user_id,
      deliveries.delivery_id,
      'rss_feed_item',
      'rss_item_manual_send',
      'manual_send',
      ${distribution.sender_user_id},
      ${item.id},
      ${item.url}
    FROM follower_distribution_deliveries deliveries
    WHERE deliveries.distribution_id = ${distribution.id}
      AND deliveries.recipient_user_id = ANY(${recipientIds}::uuid[])
    ORDER BY deliveries.recipient_user_id, deliveries.delivery_id
    ON CONFLICT (user_id, id) DO NOTHING
  `)

  return {
    failed: false,
    notificationsToDeliver: await getUnpushedNotificationsForDeliveries(
      distribution.id,
      recipientIds,
      query,
    ),
  }
}
