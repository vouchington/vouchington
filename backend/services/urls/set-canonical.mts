import { write, beginTransaction } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
} from './hacker-news-references-types.mts'

export class CircularCanonicalReferenceError extends Error {
  readonly code = 'CIRCULAR_CANONICAL_REFERENCE'

  constructor(sourceUrl: string, targetUrl: string) {
    super(
      `Circular canonical reference detected: Cannot set "${sourceUrl}" canonical to "${targetUrl}" as it would create a cycle`,
    )
    this.name = 'CircularCanonicalReferenceError'
  }
}

const MAX_CANONICAL_CHAIN_DEPTH = 10

async function getCanonicalCycleUrls(urlId: string, canonicalUrlId: string, query: QueryExecutor) {
  const urlData = await query<{ id: string; url: string }>(
    `/* getCanonicalCycleUrls */ SELECT id, url FROM urls WHERE id = ANY($1)`,
    [[urlId, canonicalUrlId]],
  )
  return new Map(urlData.rows.map((row: { id: string; url: string }) => [row.id, row.url]))
}

/** Returns the canonical target after commit so callers can schedule a fresh lookup for it. */
export const setCanonicalUrl = async (urlId: string, canonicalUrlId: string): Promise<string> => {
  // Prevent self-reference
  if (urlId === canonicalUrlId) {
    throw new Error('URL cannot be its own canonical')
  }

  await using query = await beginTransaction()

  // Check for circular reference using recursive CTE
  // Pattern from: /backend/services/posts/search/query-builder.mts:58-79
  const cycleCheck = await query(
    `/* setCanonicalUrl */
    WITH RECURSIVE url_chain AS (
      SELECT id, canonical_url_id, 0 AS depth
      FROM urls
      WHERE id = $1

      UNION ALL

      SELECT u.id, u.canonical_url_id, uc.depth + 1
      FROM urls u
      INNER JOIN url_chain uc ON u.id = uc.canonical_url_id
      WHERE uc.canonical_url_id IS NOT NULL
        AND uc.depth < $2
    )
    SELECT id FROM url_chain WHERE id = $3
  `,
    [canonicalUrlId, MAX_CANONICAL_CHAIN_DEPTH, urlId],
  )

  if (cycleCheck.rows.length > 0) {
    const urlMap = await getCanonicalCycleUrls(urlId, canonicalUrlId, query)
    const sourceUrl = urlMap.get(urlId) || urlId
    const targetUrl = urlMap.get(canonicalUrlId) || canonicalUrlId

    throw new CircularCanonicalReferenceError(sourceUrl, targetUrl)
  }

  // Resolve the final canonical target (in case canonicalUrlId itself has a canonical)
  const finalCanonicalId = await resolveCanonicalTarget(canonicalUrlId, query)

  // Atomically set canonical_url_id and flatten any back-references
  {
    await query(
      `/* setCanonicalUrl */
      UPDATE urls
      SET canonical_url_id = $1
      WHERE id = $2
    `,
      [finalCanonicalId, urlId],
    )

    // Flatten back-references: any URL pointing to urlId should now point to finalCanonicalId
    await query(
      `/* flattenCanonicalChain */
      -- no-mistakes-disable-next-line postgres-bounded-statements: every direct back-reference must be repointed in this transaction to preserve one-hop canonical resolution at commit; the number of referencing URLs is uncapped, so a LIMIT would leave stale canonical chains.
      UPDATE urls SET canonical_url_id = $1 WHERE canonical_url_id = $2 AND id != $3`,
      [finalCanonicalId, urlId, urlId],
    )

    // The URL row lock also fences refreshes: the writer locks that row before writing totals
    // and skips URLs that gained a canonical. Each source holds at most 25 rows per item table.
    // Take the totals lock before item locks, matching refreshes and retention.
    await query(
      `/* removeCanonicalSourceHackerNewsTotals */
      DELETE FROM url_hacker_news_totals WHERE url_id = $1`,
      [urlId],
    )
    await query(
      `/* removeCanonicalSourceHackerNewsStories */
      WITH candidates AS (
        SELECT url_id, hacker_news_item_id FROM url_hacker_news_stories
        WHERE url_id = $1 ORDER BY hacker_news_item_id LIMIT $2
      )
      DELETE FROM url_hacker_news_stories AS stories
      USING candidates
      WHERE stories.url_id = candidates.url_id
        AND stories.hacker_news_item_id = candidates.hacker_news_item_id`,
      [urlId, HACKER_NEWS_STORY_CAP_PER_URL],
    )
    await query(
      `/* removeCanonicalSourceHackerNewsComments */
      WITH candidates AS (
        SELECT url_id, hacker_news_item_id FROM url_hacker_news_comments
        WHERE url_id = $1 ORDER BY hacker_news_item_id LIMIT $2
      )
      DELETE FROM url_hacker_news_comments AS comments
      USING candidates
      WHERE comments.url_id = candidates.url_id
        AND comments.hacker_news_item_id = candidates.hacker_news_item_id`,
      [urlId, HACKER_NEWS_COMMENT_CAP_PER_URL],
    )
  }
  await query.commit()

  // A concurrent canonical update can leave a two-hop chain after flattening. Read the primary
  // after commit; lookup workers must resolve once more when they execute a queued lookup.
  return await resolveCanonicalTarget(urlId, write)
}

async function resolveCanonicalTarget(urlId: string, query: QueryExecutor): Promise<string> {
  const resolved = await query<{ id: string }>(
    `/* resolveCanonicalTarget */ WITH RECURSIVE chain AS (
      SELECT id, canonical_url_id, 0 AS depth FROM urls WHERE id = $1
      UNION ALL
      SELECT u.id, u.canonical_url_id, c.depth + 1
      FROM urls u JOIN chain c ON u.id = c.canonical_url_id
      WHERE c.canonical_url_id IS NOT NULL AND c.depth < $2
    ) SELECT id FROM chain WHERE canonical_url_id IS NULL ORDER BY depth DESC LIMIT 1`,
    [urlId, MAX_CANONICAL_CHAIN_DEPTH],
  )
  const resolvedId = resolved.rows[0]?.id
  if (!resolvedId) throw new Error(`Cannot resolve canonical URL for ${urlId}`)
  return resolvedId
}
