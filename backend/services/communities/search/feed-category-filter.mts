import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommunityFeedCategory } from '../search.mts'

export function appendFeedCategoryFilter(
  searchQuery: SQLStatement,
  feedCategory: CommunityFeedCategory | undefined,
) {
  if (feedCategory === 'posts' || feedCategory === 'news_topics') {
    searchQuery.append(sql`
      AND EXISTS (
        SELECT 1
        FROM community_list_items__topics clit
        WHERE clit.community_id = c.id
          AND clit.removed_at IS NULL
      )`)
  } else if (feedCategory === 'news_sources') {
    searchQuery.append(sql`
      AND EXISTS (
        SELECT 1
        FROM community_list_items__rss_feeds clir
        WHERE clir.community_id = c.id
          AND clir.removed_at IS NULL
      )`)
  } else if (feedCategory === 'news') {
    searchQuery.append(sql`
      AND (
        EXISTS (
          SELECT 1
          FROM community_list_items__topics clit
          WHERE clit.community_id = c.id
            AND clit.removed_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM community_list_items__rss_feeds clir
          WHERE clir.community_id = c.id
            AND clir.removed_at IS NULL
        )
      )`)
  }
}
