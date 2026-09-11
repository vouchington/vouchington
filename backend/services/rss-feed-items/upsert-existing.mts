import type { ExistingRssFeedItemRow } from './upsert-queries.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { chunkArray, RSS_FEED_ITEM_SQL_BATCH_SIZE } from './processing-limits.mts'

export async function getExistingRssFeedItems(
  rssFeedId: string,
  urlHostnameId: string,
  guids: string[],
): Promise<ExistingRssFeedItemRow[]> {
  return (
    await Promise.all(
      chunkArray(guids, RSS_FEED_ITEM_SQL_BATCH_SIZE).map(async guidChunk => {
        const { rows } = await read<ExistingRssFeedItemRow>(sql`/* upsertRssFeedItems */
          SELECT rss_feed_item_ids.id, rss_feed_item_ids.guid, rss_feed_items.url_id,
                 rss_feed_items.bedrock_nova_multimodal_v1_content_sha256,
                 rss_feed_items.data->'media:starRating' AS media_star_rating,
                 rss_feed_items.data->'media:statistics' AS media_statistics,
                 rss_feed_items.data->>'chapters_url' AS chapters_url,
                 rss_feed_items.data->>'chapters_type' AS chapters_type,
                 rss_feed_items.data->>'isoDate' AS iso_date,
                 rss_feed_items.data->>'pubDate' AS pub_date,
                 rss_feed_items.data->>'player_url' AS player_url,
                 rss_feed_items.media_type::text AS media_type,
                 rss_feed_items.video_id,
                 rss_feed_items.video_platform,
                 (rss_feed_items.bedrock_nova_multimodal_v1_embedding IS NOT NULL) AS has_embedding,
                 rss_feed_items.published_at,
                 EXISTS (
                   SELECT 1
                   FROM rss_feed_item_sources
                   WHERE rss_feed_id = ${rssFeedId}
                     AND rss_feed_item_id = rss_feed_item_ids.id
                 ) AS is_linked_to_current_feed,
                 EXISTS (
                   SELECT 1
                   FROM rss_feed_item_sources source
                   JOIN rss_feeds source_feed ON source_feed.id = source.rss_feed_id
                   WHERE source.rss_feed_item_id = rss_feed_item_ids.id
                     AND source_feed.deleted_at IS NULL
                     AND source_feed.is_enabled = TRUE
                     AND source_feed.is_discoverable = TRUE
                 ) AS has_eligible_source
          FROM rss_feed_item_ids
          JOIN rss_feed_items ON rss_feed_items.id = rss_feed_item_ids.id
          WHERE rss_feed_item_ids.url_hostname_id = ${urlHostnameId}
            AND rss_feed_item_ids.guid = ANY(${guidChunk}::text[])
            AND rss_feed_items.deleted_at IS NULL
        `)
        return rows
      }),
    )
  ).flat()
}
