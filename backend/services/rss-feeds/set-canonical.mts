import { read, beginTransaction } from '@data-stores/psql'

export class CircularRssFeedCanonicalError extends Error {
  readonly code = 'CIRCULAR_CANONICAL_REFERENCE'

  constructor(sourceId: string, targetId: string) {
    super(
      `Circular canonical reference detected: Cannot set RSS feed "${sourceId}" canonical to "${targetId}" as it would create a cycle`,
    )
    this.name = 'CircularRssFeedCanonicalError'
  }
}

const MAX_CANONICAL_CHAIN_DEPTH = 10

export const setCanonicalRssFeed = async (
  rssFeedId: string,
  canonicalRssFeedId: string,
): Promise<void> => {
  if (rssFeedId === canonicalRssFeedId) {
    throw new Error('RSS feed cannot be its own canonical')
  }

  // Check for circular reference using recursive CTE
  const cycleCheck = await read(
    `/* setCanonicalRssFeed */
    WITH RECURSIVE feed_chain AS (
      SELECT id, canonical_rss_feed_id, 0 AS depth
      FROM rss_feeds
      WHERE id = $1

      UNION ALL

      SELECT f.id, f.canonical_rss_feed_id, fc.depth + 1
      FROM rss_feeds f
      INNER JOIN feed_chain fc ON f.id = fc.canonical_rss_feed_id
      WHERE fc.canonical_rss_feed_id IS NOT NULL
        AND fc.depth < $2
    )
    SELECT id FROM feed_chain WHERE id = $3
  `,
    [canonicalRssFeedId, MAX_CANONICAL_CHAIN_DEPTH, rssFeedId],
  )

  if (cycleCheck.rows.length > 0) {
    throw new CircularRssFeedCanonicalError(rssFeedId, canonicalRssFeedId)
  }

  // Resolve the final canonical target (in case canonicalRssFeedId itself has a canonical)
  const resolved = await read(
    `/* resolveCanonicalRssFeedTarget */ WITH RECURSIVE chain AS (
      SELECT id, canonical_rss_feed_id, 0 AS depth FROM rss_feeds WHERE id = $1
      UNION ALL
      SELECT f.id, f.canonical_rss_feed_id, c.depth + 1
      FROM rss_feeds f JOIN chain c ON f.id = c.canonical_rss_feed_id
      WHERE c.canonical_rss_feed_id IS NOT NULL AND c.depth < $2
    ) SELECT id FROM chain WHERE canonical_rss_feed_id IS NULL ORDER BY depth DESC LIMIT 1`,
    [canonicalRssFeedId, MAX_CANONICAL_CHAIN_DEPTH],
  )
  const finalCanonicalId = resolved.rows[0]?.id ?? canonicalRssFeedId

  // Atomically set canonical_rss_feed_id and flatten any back-references
  await using query = await beginTransaction()
  {
    await query(
      `/* setCanonicalRssFeed */
      UPDATE rss_feeds
      SET canonical_rss_feed_id = $1
      WHERE id = $2
    `,
      [finalCanonicalId, rssFeedId],
    )

    // Flatten back-references: any feed pointing to rssFeedId should now point to finalCanonicalId
    await query(
      `/* flattenCanonicalRssFeedChain */ UPDATE rss_feeds SET canonical_rss_feed_id = $1 WHERE canonical_rss_feed_id = $2 AND id != $3`,
      [finalCanonicalId, rssFeedId, rssFeedId],
    )
  }
  await query.commit()
}
