import type { ListItemType } from './types.mts'

/** Closed SQL projections shared by insert and duplicate-read paths. $2 is the entity ID. */
export function itemFactsSql(itemType: ListItemType): string {
  if (itemType === 'rss_feed_item') {
    return `
      SELECT rfi.id AS entity_id, rfi.media_type::text AS media_type,
        COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url) AS entity_label,
        NULL::text AS label_markdown, NULL::text AS label_summary
      FROM rss_feed_items rfi
      JOIN urls article_url ON article_url.id = rfi.url_id
      WHERE rfi.id = $2::uuid
    `
  }
  return `
    SELECT post.id AS entity_id, NULL::text AS media_type,
      ${postItemFactsSql('post')}
    FROM posts post
    WHERE post.id = $2::uuid
  `
}

/** Aliases are closed service-owned SQL identifiers, never caller input. */
export function postItemFactsSql(alias: 'post' | 'candidate_post'): string {
  const label = `COALESCE(NULLIF(BTRIM(${alias}.title), ''),
    (SELECT MIN(slug) FROM post_slugs WHERE post_id = ${alias}.id))`
  return `${label} AS entity_label,
    CASE WHEN ${label} IS NULL THEN ${alias}.markdown END AS label_markdown,
    CASE WHEN ${label} IS NULL THEN ${alias}.ai_summary_markdown END AS label_summary`
}
