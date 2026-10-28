import type { ListItemType } from './types.mts'

/** Closed SQL projections shared by insert and duplicate-read paths. $2 is the entity ID. */
export function itemFactsSql(itemType: ListItemType): string {
  if (itemType === 'rss_feed_item') {
    return `
      SELECT rfi.id AS entity_id, rfi.media_type::text AS media_type,
        COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url) AS entity_label
      FROM rss_feed_items rfi
      JOIN urls article_url ON article_url.id = rfi.url_id
      WHERE rfi.id = $2::uuid
    `
  }
  return `
    SELECT post.id AS entity_id, NULL::text AS media_type,
      COALESCE(NULLIF(BTRIM(post.title), ''),
        (SELECT MIN(slug) FROM post_slugs WHERE post_id = post.id),
        LEFT(NULLIF(BTRIM(post.markdown), ''), 80),
        LEFT(NULLIF(BTRIM(post.ai_summary_markdown), ''), 80),
        LEFT(NULLIF(post.markdown, ''), 80),
        LEFT(NULLIF(post.ai_summary_markdown, ''), 80)) AS entity_label
    FROM posts post
    WHERE post.id = $2::uuid
  `
}
