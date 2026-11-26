import { randomUUID } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  RSS_FEED_FETCH_MAX_ITEMS,
  RSS_FEED_ITEM_MAX_CATEGORIES,
} from '@services/rss-feed-items/processing-limits'
import {
  rssFeedItemsWorkConfig,
  rssFeedItemsWorkMaxValues,
} from '@services/rss-feed-items/work-limits'
import { rssFeedsWorkMaxValues } from '@services/rss-feeds/work-limits'
import { pinDynamicConfigFields } from '@voucha/test-helpers/dynamic-config'
import { contentHash, seedUuid } from '../seed-data/common.mts'

// The crawler is the only writer caller. Its 500-item and 20-category parser caps bind
// before the configurable 2,500-item SQL and 5,000-category feed SQL chunk ceilings.
export const rssWriteItemCapacity = Math.min(
  RSS_FEED_FETCH_MAX_ITEMS,
  rssFeedItemsWorkMaxValues.sql_batch_size,
)
export const rssWriteItemCategoryCapacity = Math.min(
  RSS_FEED_FETCH_MAX_ITEMS * RSS_FEED_ITEM_MAX_CATEGORIES,
  rssFeedItemsWorkMaxValues.category_sql_batch_size,
)
export const rssWriteFeedCategoryCapacity = Math.min(
  rssFeedsWorkMaxValues.podcast_max_categories,
  rssFeedsWorkMaxValues.category_sql_batch_size,
)

// A Valkey refresh replaces the shared field map between awaits and resets the pinned batch size
// to its 1,000 default, which splits one measured write into several statements. Pin it again in
// the same turn as the measured call, as topic-data-point-insights does.
export function pinRssCategorySqlBatchSize(): void {
  pinDynamicConfigFields(rssFeedItemsWorkConfig, {
    category_sql_batch_size: rssWriteItemCategoryCapacity,
  })
}

export async function seedRssWriteCapacity() {
  const prefix = `explainrss${randomUUID().replaceAll('-', '')}`
  const hostnameId = seedUuid(0, '02')
  const topicId = seedUuid(0, '04')
  const hostname = 'seed-host-0.example.com'
  const pathname = `/${prefix}/feed.xml`
  await using query = await beginTransaction()
  const { rows: urls } = await query<{ id: string }>(
    `/* seedRssWriteCapacityUrl */
     INSERT INTO urls (hostname_id, url, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id`,
    [hostnameId, `https://${hostname}${pathname}`, pathname],
  )
  const urlId = urls[0]!.id
  const { rows: topics } = await query<{ id: string }>(
    `/* seedRssWriteCapacityTopic */
     INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
     VALUES ($1, $1, $2, 'system') RETURNING id`,
    [prefix, contentHash(prefix)],
  )
  const feedTopicId = topics[0]!.id
  const { rows: feeds } = await query<{ id: string }>(
    `/* seedRssWriteCapacityFeed */
     INSERT INTO rss_feeds (rss_feed_url_id, topic_id, created_via)
     VALUES ($1, $2, 'system') RETURNING id`,
    [urlId, feedTopicId],
  )
  const feedId = feeds[0]!.id
  const { rows: itemRows } = await query<{ id: string }>(
    `/* seedRssWriteCapacityItems */
     WITH identities AS (
       INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
       SELECT $1::uuid, $2::text || '-item-' || ordinal
       FROM generate_series(1, $3::int) AS input(ordinal)
       RETURNING id
     )
     INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, $4::uuid, jsonb_build_object('title', 'Explain RSS write item'),
       $5::bytea FROM identities
     RETURNING id`,
    [hostnameId, prefix, rssWriteItemCapacity, urlId, contentHash(`${prefix} items`)],
  )
  await query.commit()

  const itemIds = itemRows.map(row => row.id).toSorted()
  return { prefix, hostnameId, topicId, urlId, feedId, feedTopicId, itemIds }
}

export type RssWriteCapacityFixture = Awaited<ReturnType<typeof seedRssWriteCapacity>>

export async function cleanupRssWriteCapacity(fixture: RssWriteCapacityFixture): Promise<void> {
  await using query = await beginTransaction()
  await removeFeedItems(query, fixture)
  await query(
    `/* cleanupRssWriteCapacityFeedCategoryBackground */
     DELETE FROM rss_feed_categories category
     USING rss_category_identities identity
     WHERE category.category_identity_id = identity.id AND identity.category_text LIKE $1`,
    [`${fixture.prefix}%`],
  )
  await query(
    `/* cleanupRssWriteCapacityLabels */
     WITH aliases AS (DELETE FROM topic_aliases WHERE alias LIKE $1)
     DELETE FROM rss_category_identities WHERE category_text LIKE ANY($2::text[])`,
    [`${fixture.prefix}%`, [`${fixture.prefix}%`, `#${fixture.prefix}%`]],
  )
  await query(
    `/* cleanupRssWriteCapacityTopicAndUrl */
     WITH removed_url AS (DELETE FROM urls WHERE id = $1),
       removed_topic AS (DELETE FROM topics WHERE id = $2 RETURNING id)
     DELETE FROM retained_topic_identities identity
     USING removed_topic WHERE identity.id = removed_topic.id`,
    [fixture.urlId, fixture.feedTopicId],
  )
  await query.commit()
}

async function removeFeedItems(query: TransactionQuery, fixture: RssWriteCapacityFixture) {
  await query('/* cleanupRssWriteCapacityFeed */ DELETE FROM rss_feeds WHERE id = $1', [
    fixture.feedId,
  ])
  await query(
    `/* cleanupRssWriteCapacityItems */
     DELETE FROM rss_feed_item_guids WHERE url_hostname_id = $1 AND guid LIKE $2`,
    [fixture.hostnameId, `${fixture.prefix}%`],
  )
  await query(
    `/* cleanupRssWriteCapacityRetained */
     DELETE FROM retained_rss_feed_item_identities
     WHERE id = ANY($1::uuid[])`,
    [fixture.itemIds],
  )
}
