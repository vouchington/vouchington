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
        c.og_image_exact AS og_image,
        c.og_audio AS og_audio,
        CASE WHEN ${access === 'administrator'} THEN NULLIF(c.markdown, '') ELSE NULL END AS markdown,
        CASE WHEN ${access === 'administrator'} THEN fn_crawl_embed_json(c) ELSE NULL END AS embed_metadata,
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
        CASE WHEN c.embed_has_thumbnail THEN NULLIF(TRIM(c.embed_thumbnail_url), '') ELSE NULL END AS embed_thumbnail_url,
        NULLIF(TRIM(c.embed_title), '') AS embed_title,
        NULLIF(TRIM(c.embed_description), '') AS embed_description,
        CASE WHEN c.embed_has_provider THEN NULLIF(TRIM(c.embed_provider_name), '') ELSE NULL END AS embed_provider_name,
        c.og_image,
        c.twitter_image,
        c.og_audio,
        c.og_title,
        c.twitter_title,
        c.og_description,
        c.twitter_description,
        c.og_site_name AS og_provider_name,
        c.embed_kind AS display_embed_kind,
        CASE WHEN c.embed_has_provider THEN NULLIF(TRIM(c.embed_provider_key), '') ELSE NULL END AS display_provider_key,
        CASE WHEN c.embed_has_provider THEN NULLIF(TRIM(c.embed_provider_resource_id), '') ELSE NULL END
          AS display_provider_resource_id,
        CASE WHEN c.embed_has_player THEN NULLIF(TRIM(c.embed_player_url), '') ELSE NULL END AS display_player_url,
        CASE WHEN c.embed_has_player THEN c.embed_player_width ELSE NULL END AS display_player_width,
        CASE WHEN c.embed_has_player THEN c.embed_player_height ELSE NULL END AS display_player_height,
        (c.embed_oembed_resolved_at IS NOT NULL) AS display_embed_metadata_resolved
      FROM crawls c
      CROSS JOIN canonical_url cu
      WHERE c.url_id = cu.id
        AND c.completed_at IS NOT NULL
        AND c.network_error IS NULL
        AND c.response_status_code BETWEEN 200 AND 299
        AND (
          c.embed_kind IS NOT NULL
          OR c.og_image IS NOT NULL
          OR c.twitter_image IS NOT NULL
          OR c.og_audio IS NOT NULL
          OR c.og_title IS NOT NULL
          OR c.twitter_title IS NOT NULL
          OR c.og_description IS NOT NULL
          OR c.twitter_description IS NOT NULL
          OR c.og_site_name IS NOT NULL
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
