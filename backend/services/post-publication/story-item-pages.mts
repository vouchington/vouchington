import sql, { type SQLStatement } from 'sql-template-strings'
import { publicationPageLimit } from './page-limit.mts'

/** One native seek per row keeps an early-stop plan even for cardinality-skewed scopes. */
export function publicationStoryItemPageCtes(
  scope: SQLStatement,
  limit: number,
  inclusive: boolean,
  highWater = false,
): SQLStatement {
  const budget = publicationPageLimit(limit)
  return sql`WITH RECURSIVE story_scope AS MATERIALIZED (`
    .append(scope)
    .append(sql`), items AS (
    SELECT first_item.*, 1::bigint AS page_number FROM story_scope CROSS JOIN LATERAL (`)
    .append(storyItemSeek(sql`story_scope.cursor_id`, inclusive, highWater))
    .append(sql`) first_item UNION ALL
    SELECT next_item.*, previous.page_number + 1 FROM items previous CROSS JOIN story_scope
    CROSS JOIN LATERAL (`)
    .append(storyItemSeek(sql`previous.id`, false, highWater))
    .append(sql`) next_item WHERE previous.page_number < `)
    .append(budget)
    .append(') ')
}

function storyItemSeek(cursor: SQLStatement, inclusive: boolean, highWater: boolean): SQLStatement {
  const upper = highWater
    ? sql`story_scope.high_water_id`
    : sql`'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid`
  return sql`SELECT id, url_id FROM rss_feed_items
    WHERE story_id IS NOT NULL AND deleted_at IS NULL
      AND (story_id, id) <= (story_scope.story_id, `
    .append(upper)
    .append(sql`)
      AND (story_id, id) `)
    .append(inclusive ? '>=' : '>')
    .append(sql` (story_scope.story_id, `)
    .append(cursor)
    .append(') ORDER BY story_id, id LIMIT 1')
}
