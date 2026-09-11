import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export function buildUpsertRssFeedItemsQuery(
  identityIdsByGuid: ReadonlyMap<string, string>,
  itemsToUpsert: RssFeedItemWithHash[],
) {
  const rows = itemsToUpsert
    .map(item => ({ id: identityIdsByGuid.get(item.feedItem.guid)!, item }))
    .sort((left, right) => left.id.localeCompare(right.id))
  return {
    text: `/* upsertRssFeedItems */
      INSERT INTO rss_feed_items (
        id,
        url_id,
        data,
        bedrock_nova_multimodal_v1_content_sha256,
        media_type,
        enclosure_url,
        enclosure_type,
        enclosure_length,
        duration_seconds,
        thumbnail_url,
        video_id,
        video_platform
      )
      SELECT
        input.id,
        input.url_id,
        input.data,
        input.bedrock_nova_multimodal_v1_content_sha256,
        input.media_type,
        input.enclosure_url,
        input.enclosure_type,
        input.enclosure_length,
        input.duration_seconds,
        input.thumbnail_url,
        input.video_id,
        input.video_platform
      FROM unnest(
        $1::uuid[], $2::uuid[], $3::jsonb[], $4::bytea[], $5::rss_feed_item_media_types[],
        $6::text[], $7::text[], $8::bigint[], $9::integer[], $10::text[], $11::text[], $12::text[]
      ) AS input(
        id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, media_type,
        enclosure_url, enclosure_type, enclosure_length, duration_seconds, thumbnail_url,
        video_id, video_platform
      )
      ORDER BY input.id
      ON CONFLICT (id)
      DO UPDATE SET
        url_id = EXCLUDED.url_id,
        data = EXCLUDED.data,
        bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256,
        media_type = EXCLUDED.media_type,
        enclosure_url = EXCLUDED.enclosure_url,
        enclosure_type = EXCLUDED.enclosure_type,
        enclosure_length = EXCLUDED.enclosure_length,
        duration_seconds = EXCLUDED.duration_seconds,
        thumbnail_url = EXCLUDED.thumbnail_url,
        video_id = EXCLUDED.video_id,
        video_platform = EXCLUDED.video_platform,
        deleted_at = NULL
      RETURNING id,
                url_id,
                story_id,
                (bedrock_nova_multimodal_v1_embedding IS NOT NULL) AS has_embedding,
                published_at
    `,
    values: [
      rows.map(row => row.id),
      rows.map(row => row.item.url_id),
      rows.map(row => JSON.stringify(row.item.feedItem)),
      rows.map(row => row.item.content_sha256),
      rows.map(row => row.item.feedItem.media_type ?? 'article'),
      rows.map(row => row.item.feedItem.enclosure_url ?? null),
      rows.map(row => row.item.feedItem.enclosure_type ?? null),
      rows.map(row => row.item.feedItem.enclosure_length ?? null),
      rows.map(row => row.item.feedItem.duration_seconds ?? null),
      rows.map(row => row.item.feedItem.thumbnail_url ?? null),
      rows.map(row => row.item.feedItem.video_id ?? null),
      rows.map(row => row.item.feedItem.video_platform ?? null),
    ],
  }
}
