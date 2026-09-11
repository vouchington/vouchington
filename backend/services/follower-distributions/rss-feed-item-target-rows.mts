import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { firstVisibleRssTextField } from '@modules/utils'
import type { DistributionRow, ProcessTargetRowsResult } from './process-types.mts'
import { truncateText } from './shared.mts'
import { getUnpushedNotificationsForDeliveries, markDistributionFailed } from './process-state.mts'

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

  await query(sql`/* insertRssFeedItemFeedShares */
    INSERT INTO rss_feed_item_feed_shares (
      recipient_user_id,
      id,
      shared_by_user_id,
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
      rss_feed_items.data,
      urls.url
	    FROM rss_feed_items
	    JOIN urls ON urls.id = rss_feed_items.url_id
	    WHERE rss_feed_items.id = ${distribution.rss_feed_item_id}
	      AND rss_feed_items.deleted_at IS NULL
	  `)
  const item = rows[0] as
    | { id: string; data: Record<string, string | undefined> | null; url: string }
    | undefined
  if (!item) {
    await markDistributionFailed(distribution.id, 'RSS feed item not found', query)
    return { failed: true, notificationsToDeliver: [] }
  }

  const title = `${distribution.sender_username ? `@${distribution.sender_username}` : 'Someone'} sent you an article`
  const data = item.data ?? {}
  const body = truncateText(
    firstVisibleRssTextField([
      data.title,
      data.contentSnippet,
      data.description,
      data.summary,
      data['media:description'],
    ]),
    180,
  )

  await query(sql`/* insertRssFeedItemManualSendNotifications */
    INSERT INTO notifications (
      user_id,
      id,
      entity_type,
      delivery_type,
      sent_by_user_id,
      rss_feed_item_id,
      title,
      body,
      actor_label,
      target_path
    )
    SELECT
      deliveries.recipient_user_id,
      deliveries.delivery_id,
      'rss_feed_item',
      'manual_send',
      ${distribution.sender_user_id},
      ${item.id},
      ${title},
      ${body},
      ${distribution.sender_username},
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
