import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  type RawEmbedRow,
  type UrlEmbed,
  type UrlEmbedAccess,
  buildEmbed,
} from './url-embed-types.mts'
export type { UrlEmbed }
export { getUrlEmbedsByUrlIds } from './get-url-embeds.mts'
export async function getUrlEmbedByUrlId(
  urlId: string,
  options: QueryOptions = {},
  access: UrlEmbedAccess = 'public',
): Promise<UrlEmbed | null> {
  const { rows } = await read(
    sql`/* getUrlEmbedByUrlId */
    WITH item AS (
      SELECT DISTINCT ON (rfi.url_id)
        rfi.id AS rss_feed_item_id, rfi.url_id,
        rfi.media_type::text AS media_type, rfi.video_id, rfi.video_platform,
        rfi.enclosure_url, rfi.enclosure_type, rfi.duration_seconds, rfi.thumbnail_url,
        NULLIF(TRIM(rfi.data->>'player_url'), '') AS rss_player_url, NULLIF(TRIM(rfi.data->>'title'), '') AS item_title
      FROM rss_feed_items rfi
      WHERE rfi.url_id = ${urlId}
        AND rfi.deleted_at IS NULL
      ORDER BY rfi.url_id, rfi.id DESC
    ),
    show_context AS (
      SELECT DISTINCT ON (rfis.rss_feed_item_id)
        rfis.rss_feed_item_id,
        rf.id AS show_id, rf.title AS show_title,
        t.slug AS show_topic_slug, t.topic_type AS show_topic_type
      FROM item i
      JOIN rss_feed_item_sources rfis ON rfis.rss_feed_item_id = i.rss_feed_item_id
      JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id AND rf.deleted_at IS NULL
      JOIN topics t ON t.id = rf.topic_id AND t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL
      ORDER BY rfis.rss_feed_item_id, rf.id ASC
    ),
    canonical_url AS (
      SELECT canonical.id, canonical.url
      FROM urls u
      JOIN urls canonical ON canonical.id = COALESCE(u.canonical_url_id, u.id)
      WHERE u.id = ${urlId}
    ),
    crawl AS (
      SELECT DISTINCT ON (c.url_id)
        c.url_id,
        NULLIF(TRIM(c.title), '')                  AS crawl_title,
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
      FROM crawls c
      CROSS JOIN canonical_url cu
      WHERE c.url_id = cu.id
        AND c.completed_at IS NOT NULL
        AND c.network_error IS NULL
        AND c.response_status_code BETWEEN 200 AND 299
      ORDER BY c.url_id, c.id DESC
    ),
    embed_crawl AS (
      SELECT DISTINCT ON (c.url_id)
        c.url_id,
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
      FROM crawls c
      CROSS JOIN canonical_url cu
      WHERE c.url_id = cu.id
        AND c.completed_at IS NOT NULL
        AND c.network_error IS NULL
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
      ORDER BY c.url_id, c.id DESC
    )
    SELECT
      i.rss_feed_item_id, u.url AS source_url, i.media_type,
      i.video_id, i.video_platform, i.rss_player_url,
      i.enclosure_url, COALESCE(c.og_audio, ec.og_audio) AS crawl_audio_url, cu.url AS crawl_source_url,
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
      sc.show_id, sc.show_title, sc.show_topic_slug, sc.show_topic_type
    FROM urls u
    CROSS JOIN canonical_url cu
    LEFT JOIN item i ON i.url_id = u.id
    LEFT JOIN show_context sc ON sc.rss_feed_item_id = i.rss_feed_item_id
    LEFT JOIN crawl c ON c.url_id = cu.id
    LEFT JOIN embed_crawl ec ON ec.url_id = cu.id
    WHERE u.id = ${urlId}
  `,
    options,
  )
  if (rows.length === 0) return null
  return buildEmbed(rows[0] as RawEmbedRow, access)
}
