import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * A URL with at least one Hacker News story or comment link. Zero-hit lookups keep a totals
 * row, so the filter reads the counts, never row existence.
 */
const URL_HAS_REFERENCES = sql`(totals.story_count > 0 OR totals.comment_count > 0)`

/**
 * Posts that show Hacker News references: the post's own link URL or a live, positively
 * voted related URL is referenced. The related leg accepts any such URL, while the card and
 * detail reads (`getHackerNewsUrlIdsByPostIds`) keep only the top
 * HACKER_NEWS_RELATED_URLS_PER_POST_MAX, so a post whose only referenced URL ranks lower
 * matches the filter and shows no references.
 *
 * The partial index on `url_hacker_news_totals` (rows with a story or comment) exists so these
 * checks and the RSS semi-join can find referenced URLs without scanning unreferenced totals.
 */
export function buildPostHasHackerNewsReferences(): SQLStatement {
  return sql`(
    EXISTS (
      SELECT 1
      FROM url_hacker_news_totals totals
      WHERE totals.url_id = posts.url_id
        AND `
    .append(URL_HAS_REFERENCES)
    .append(
      sql`
    ) OR EXISTS (
      SELECT 1
      FROM "relation__post__related__url" rel
      JOIN url_hacker_news_totals totals ON totals.url_id = rel.object_id
      WHERE rel.subject_id = posts.id
        AND rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
        AND `,
    )
    .append(URL_HAS_REFERENCES).append(sql`
    )
  )`)
}

/** RSS feed items, including podcast episodes, whose URL has Hacker News references. */
export function buildRssFeedItemHasHackerNewsReferences(): SQLStatement {
  return sql`EXISTS (
    SELECT 1
    FROM url_hacker_news_totals totals
    WHERE totals.url_id = rss_feed_items.url_id
      AND `.append(URL_HAS_REFERENCES).append(sql`
  )`)
}
