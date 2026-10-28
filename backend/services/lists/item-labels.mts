import { write } from '@data-stores/psql'
import assert from 'http-assert'
import type { ListItemType } from './types.mts'

/** Read the source fact before inserting, so a missing label cannot leave a saved row behind. */
export async function getListItemLabelForAdd(
  itemType: ListItemType,
  entityId: string,
): Promise<{ mediaType: string | null; entityLabel: string }> {
  if (itemType === 'rss_feed_item') {
    const { rows } = await write(
      `/* addListItem:mediaType */
      SELECT rfi.media_type,
        COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url) AS entity_label
      FROM rss_feed_items rfi
      JOIN urls article_url ON article_url.id = rfi.url_id
      WHERE rfi.id = $1 LIMIT 1
      `,
      [entityId],
    )
    assert(rows[0], 404, 'Saved article not found')
    return {
      mediaType: (rows[0].media_type as string | null) ?? null,
      entityLabel: rows[0].entity_label as string,
    }
  }

  const { rows } = await write(
    `/* addListItem:postLabel */
    SELECT COALESCE(NULLIF(BTRIM(post.title), ''),
      (SELECT MIN(slug) FROM post_slugs WHERE post_id = post.id),
      LEFT(NULLIF(BTRIM(post.markdown), ''), 80),
      LEFT(NULLIF(BTRIM(post.ai_summary_markdown), ''), 80),
      LEFT(NULLIF(post.markdown, ''), 80),
      LEFT(NULLIF(post.ai_summary_markdown, ''), 80)) AS entity_label
    FROM posts post WHERE post.id = $1 LIMIT 1
    `,
    [entityId],
  )
  assert(rows[0], 404, 'Saved post not found')
  assert(rows[0].entity_label, 500, 'Saved post has no title, slug or content')
  return { mediaType: null, entityLabel: rows[0].entity_label as string }
}
