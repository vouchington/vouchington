import createHttpError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { StoryCursor, StoryFeedBounds } from './story-source-types.mts'

export function appendChildLateral(
  query: SQLStatement,
  bounds: { published: SQLStatement | null; missingItemUpper: string | null },
  lookahead: number,
): void {
  query.append(sql`
      LEFT JOIN LATERAL (
        SELECT
          page.item_id,
          page.published_at,
          page.phase,
          ROW_NUMBER() OVER (
            ORDER BY page.published_at DESC NULLS LAST, page.item_id DESC
          ) AS child_rank
        FROM (
          (
            SELECT rss_feed_item_id AS item_id, published_at, 'published'::text AS phase
            FROM rss_feed_item_sources
            WHERE rss_feed_id = feed.id
              AND published_at IS NOT NULL`)
  if (bounds.published) {
    query.append(sql`
              AND (published_at, rss_feed_item_id) < (`)
    query.append(bounds.published)
    query.append(sql`)`)
  }
  query.append(sql`
            ORDER BY published_at DESC, rss_feed_item_id DESC
            LIMIT ${lookahead}
          )
          UNION ALL
          (
            SELECT rss_feed_item_id, NULL::timestamptz, 'missing'::text
            FROM rss_feed_item_sources
            WHERE rss_feed_id = feed.id
              AND published_at IS NULL
              AND `)
  if (bounds.missingItemUpper) {
    query.append(sql`rss_feed_item_id < ${bounds.missingItemUpper}::uuid`)
  } else query.append(sql`TRUE`)
  query.append(sql`
            ORDER BY rss_feed_item_id DESC
            LIMIT ${lookahead}
          )
        ) page
        ORDER BY page.published_at DESC NULLS LAST, page.item_id DESC
        LIMIT ${lookahead}
      ) src ON TRUE`)
}

export function resumeBounds(cursor: StoryCursor): StoryFeedBounds & { published: SQLStatement } {
  if (!cursor.item_id) throw createHttpError(400, 'Invalid cursor')
  if (cursor.phase === 'missing') {
    return {
      published: sql`'-infinity'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid`,
      missingItemUpper: cursor.item_id,
    }
  }
  if (!cursor.published_at) throw createHttpError(400, 'Invalid cursor')
  return {
    published: sql`${cursor.published_at}::timestamptz, ${cursor.item_id}::uuid`,
    missingItemUpper: null,
  }
}
