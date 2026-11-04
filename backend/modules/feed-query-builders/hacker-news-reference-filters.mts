import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * A URL with at least one Hacker News story or comment link. Zero-hit lookups keep a totals
 * row, so the filter reads the counts, never row existence.
 */
const URL_HAS_REFERENCES = sql`(totals.story_count > 0 OR totals.comment_count > 0)`

/**
 * References live on the canonical URL, but a post or feed item can still point at a row that
 * gained its canonical later, so every check first resolves the entity's URL through `urls`.
 * `setCanonicalUrl` flattens chains, so one hop is the norm; the second join tolerates the
 * two-hop chain a concurrent call can leave. That is two primary-key probes per candidate,
 * deliberately not a recursive CTE, which the readers use once per request but would be
 * costly per candidate post. A chain deeper than two hops is not followed and reads as
 * unreferenced until the next `setCanonicalUrl` flattens it.
 */
function canonicalTotalsJoin(urlIdColumn: string): SQLStatement {
  return sql`(
        SELECT COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id) AS canonical_id
        FROM urls source
        LEFT JOIN urls hop ON hop.id = source.canonical_url_id
        WHERE source.id = `.append(urlIdColumn).append(sql`
      ) resolved
      JOIN url_hacker_news_totals totals ON totals.url_id = resolved.canonical_id`)
}

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
      FROM `
    .append(canonicalTotalsJoin('posts.url_id'))
    .append(sql`
      WHERE `)
    .append(URL_HAS_REFERENCES)
    .append(
      sql`
    ) OR EXISTS (
      SELECT 1
      FROM "relation__post__related__url" rel
      JOIN `,
    )
    .append(
      // Same resolution for the related URL's object, correlated to the relation row.
      sql`LATERAL (
        SELECT COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id) AS canonical_id
        FROM urls source
        LEFT JOIN urls hop ON hop.id = source.canonical_url_id
        WHERE source.id = rel.object_id
      ) resolved ON true
      JOIN url_hacker_news_totals totals ON totals.url_id = resolved.canonical_id
      WHERE rel.subject_id = posts.id
        AND rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
        AND `,
    )
    .append(URL_HAS_REFERENCES).append(sql`
    )
  )`)
}

/** RSS feed items, including podcast episodes, whose URL (or its canonical) has references. */
export function buildRssFeedItemHasHackerNewsReferences(): SQLStatement {
  return sql`EXISTS (
    SELECT 1
    FROM `
    .append(canonicalTotalsJoin('rss_feed_items.url_id'))
    .append(sql`
      WHERE `)
    .append(URL_HAS_REFERENCES).append(sql`
  )`)
}
