import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommunityFeedCategory } from '../search-types.mts'

export function appendFeedCategoryFilter(
  searchQuery: SQLStatement,
  feedCategory: CommunityFeedCategory | undefined,
) {
  searchQuery.append(feedCategoryFilter(feedCategory))
}

function feedCategoryFilter(feedCategory: CommunityFeedCategory | undefined): SQLStatement {
  switch (feedCategory) {
    case undefined:
      return sql``
    case 'posts':
    case 'news_topics':
      return sql`
      AND EXISTS (
        SELECT 1
        FROM community_list_topics clit
        WHERE clit.community_id = c.id
          AND clit.removed_at IS NULL
      )`
    case 'news_sources':
      return sql`
      AND EXISTS (
        SELECT 1
        FROM community_list_rss_feeds clir
        WHERE clir.community_id = c.id
          AND clir.removed_at IS NULL
      )`
    case 'news':
      return sql`
      AND (
        EXISTS (
          SELECT 1
          FROM community_list_topics clit
          WHERE clit.community_id = c.id
            AND clit.removed_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM community_list_rss_feeds clir
          WHERE clir.community_id = c.id
            AND clir.removed_at IS NULL
        )
      )`
    /* v8 ignore next 2 -- exhaustive selector guard; the type admits no other value */
    default:
      throw new Error(`Unknown community feed category: ${String(feedCategory)}`)
  }
}
