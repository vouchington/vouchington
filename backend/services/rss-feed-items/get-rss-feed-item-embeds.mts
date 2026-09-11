import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  buildEmbed,
  type RawEmbedRow,
  type UrlEmbed,
  type UrlEmbedAccess,
} from './url-embed-types.mts'

/** Resolves every RSS item independently, including when multiple items share one URL. */
export async function getRssFeedItemEmbedsByItems(
  items: Array<{ id: string; url: { id: string } | null }>,
  options: QueryOptions = {},
  access: UrlEmbedAccess = 'public',
): Promise<Record<string, UrlEmbed>> {
  const itemIds = items.flatMap(item => (item.url ? [item.id] : []))
  if (itemIds.length === 0) return {}

  const { rows } = await read(
    sql`/* getRssFeedItemEmbedsByItems */
    WITH item AS (
      SELECT
        rfi.id AS rss_feed_item_id, (rfi.url->>'id')::uuid AS url_id,
        rfi.media_type::text AS media_type, rfi.video_id, rfi.video_platform,
        rfi.enclosure_url, rfi.enclosure_type, rfi.duration_seconds, rfi.thumbnail_url,
        NULLIF(TRIM(rfi.data->>'player_url'), '') AS rss_player_url,
        NULLIF(TRIM(rfi.data->>'title'), '') AS item_title,
        rfi.rss_feed->>'id' AS show_id,
        rfi.rss_feed->>'title' AS show_title,
        rfi.rss_feed #>> '{topic,slug}' AS show_topic_slug,
        rfi.rss_feed #>> '{topic,topic_type}' AS show_topic_type
      FROM view_rss_feed_items rfi
      WHERE rfi.id = ANY(${itemIds})
    ),
    canonical_urls AS (
      SELECT
        i.rss_feed_item_id,
        canonical.id AS canonical_id,
        u.url AS source_url,
        canonical.url AS crawl_source_url
      FROM item i
      JOIN urls u ON u.id = i.url_id
      JOIN urls canonical ON canonical.id = COALESCE(u.canonical_url_id, u.id)
    ),
    crawl AS (
      SELECT DISTINCT ON (cu.rss_feed_item_id)
        cu.rss_feed_item_id,
        NULLIF(TRIM(c.title), '') AS crawl_title,
        NULLIF(TRIM(c.meta_tags->>'og:image'), '') AS og_image,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:audio' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_audio,
        CASE WHEN ${access === 'administrator'} THEN NULLIF(c.markdown, '') ELSE NULL END AS markdown,
        CASE WHEN ${access === 'administrator'} THEN c.embed_metadata ELSE NULL END AS embed_metadata,
        CASE WHEN ${access === 'administrator'} THEN c.meta_tags ELSE NULL END AS meta_tags,
        CASE WHEN ${access === 'administrator'} THEN c.embed_oembed_url ELSE NULL END AS embed_oembed_url,
        CASE WHEN ${access === 'administrator'} THEN c.embed_oembed_resolved_at ELSE NULL END AS embed_oembed_resolved_at
      FROM canonical_urls cu
      JOIN crawls c ON c.url_id = cu.canonical_id
      WHERE c.completed_at IS NOT NULL AND c.network_error IS NULL
        AND c.response_status_code BETWEEN 200 AND 299
      ORDER BY cu.rss_feed_item_id, c.id DESC
    ),
    embed_crawl AS (
      SELECT DISTINCT ON (cu.rss_feed_item_id)
        cu.rss_feed_item_id,
        NULLIF(TRIM(c.embed_metadata #>> '{thumbnail,url}'), '') AS embed_thumbnail_url,
        NULLIF(TRIM(c.embed_metadata->>'title'), '') AS embed_title,
        NULLIF(TRIM(c.embed_metadata->>'description'), '') AS embed_description,
        NULLIF(TRIM(c.embed_metadata #>> '{provider,name}'), '') AS embed_provider_name,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:image' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_image,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'twitter:image' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS twitter_image,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:audio' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_audio,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:title' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_title,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'twitter:title' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS twitter_title,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:description' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_description,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'twitter:description' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS twitter_description,
        (SELECT NULLIF(TRIM(tag.value #>> '{}'), '')
          FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
          WHERE LOWER(tag.key) = 'og:site_name' AND jsonb_typeof(tag.value) = 'string'
          LIMIT 1) AS og_provider_name,
        CASE c.embed_metadata->>'kind'
          WHEN 'article' THEN 'article'
          WHEN 'player' THEN 'player'
          ELSE NULL
        END AS display_embed_kind,
        NULLIF(TRIM(c.embed_metadata #>> '{provider,key}'), '') AS display_provider_key,
        NULLIF(TRIM(c.embed_metadata #>> '{provider,resourceId}'), '')
          AS display_provider_resource_id,
        NULLIF(TRIM(c.embed_metadata #>> '{player,url}'), '') AS display_player_url,
        CASE WHEN jsonb_typeof(c.embed_metadata #> '{player,width}') = 'number'
          THEN (c.embed_metadata #>> '{player,width}')::double precision
          ELSE NULL
        END AS display_player_width,
        CASE WHEN jsonb_typeof(c.embed_metadata #> '{player,height}') = 'number'
          THEN (c.embed_metadata #>> '{player,height}')::double precision
          ELSE NULL
        END AS display_player_height,
        (c.embed_oembed_resolved_at IS NOT NULL) AS display_embed_metadata_resolved
      FROM canonical_urls cu
      JOIN crawls c ON c.url_id = cu.canonical_id
      WHERE c.completed_at IS NOT NULL AND c.network_error IS NULL
        AND c.response_status_code BETWEEN 200 AND 299
        AND (
          c.embed_metadata IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM jsonb_each(COALESCE(c.meta_tags, '{}'::jsonb)) AS tag(key, value)
            WHERE LOWER(tag.key) IN (
              'og:image', 'twitter:image', 'og:audio', 'og:title', 'twitter:title',
              'og:description', 'twitter:description', 'og:site_name'
            )
              AND jsonb_typeof(tag.value) = 'string'
              AND NULLIF(TRIM(tag.value #>> '{}'), '') IS NOT NULL
          )
          OR c.embed_oembed_resolved_at IS NOT NULL
        )
      ORDER BY cu.rss_feed_item_id, c.id DESC
    )
    SELECT
      i.rss_feed_item_id, cu.source_url, i.media_type,
      i.video_id, i.video_platform, i.rss_player_url,
      i.enclosure_url, COALESCE(c.og_audio, ec.og_audio) AS crawl_audio_url,
      cu.crawl_source_url,
      i.enclosure_type, i.duration_seconds,
      ARRAY[
        ec.embed_thumbnail_url,
        ec.og_image,
        ec.twitter_image,
        i.thumbnail_url,
        c.og_image
      ] AS thumbnail_urls,
      COALESCE(
        ec.embed_title,
        ec.og_title,
        ec.twitter_title,
        i.item_title,
        c.crawl_title
      ) AS title,
      COALESCE(
        ec.embed_description,
        ec.og_description,
        ec.twitter_description
      ) AS description,
      COALESCE(
        ec.embed_provider_name,
        ec.og_provider_name
      ) AS provider_name,
      ec.display_embed_kind, ec.display_provider_key, ec.display_provider_resource_id,
      ec.display_player_url, ec.display_player_width, ec.display_player_height,
      COALESCE(ec.display_embed_metadata_resolved, false) AS display_embed_metadata_resolved,
      c.embed_metadata, c.meta_tags, c.embed_oembed_url, c.embed_oembed_resolved_at,
      c.markdown,
      i.show_id, i.show_title, i.show_topic_slug, i.show_topic_type
    FROM item i
    JOIN canonical_urls cu ON cu.rss_feed_item_id = i.rss_feed_item_id
    LEFT JOIN crawl c ON c.rss_feed_item_id = i.rss_feed_item_id
    LEFT JOIN embed_crawl ec ON ec.rss_feed_item_id = i.rss_feed_item_id
  `,
    options,
  )

  const result: Record<string, UrlEmbed> = {}
  for (const row of rows as RawEmbedRow[]) {
    result[row.rss_feed_item_id!] = buildEmbed(row, access)
  }
  return result
}
