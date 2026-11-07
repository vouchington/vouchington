import { lockCanonicalUrlRewrites } from './canonical-lock.mts'
import { hackerNewsReferenceMaxValues } from './hacker-news-reference-limits.mts'
import { enqueueHackerNewsFlagsBestEffort } from '@queues/hacker-news-flags/enqueues'
import { registerPostCommitAction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'

export class CircularCanonicalReferenceError extends Error {
  readonly code = 'CIRCULAR_CANONICAL_REFERENCE'

  constructor(sourceUrl: string, targetUrl: string) {
    super(
      `Circular canonical reference detected: Cannot set "${sourceUrl}" canonical to "${targetUrl}" as it would create a cycle`,
    )
    this.name = 'CircularCanonicalReferenceError'
  }
}

export type CanonicalPair = { urlId: string; canonicalUrlId: string }
export type ResolvedCanonical = { urlId: string; finalCanonicalId: string }

const MAX_CANONICAL_CHAIN_DEPTH = 10

const CHAIN_CTE = `
  WITH RECURSIVE chain AS (
    SELECT input.url_id AS source_id, urls.id, urls.canonical_url_id, 0 AS depth
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, canonical_url_id)
    JOIN urls ON urls.id = input.canonical_url_id
    UNION ALL
    SELECT chain.source_id, urls.id, urls.canonical_url_id, chain.depth + 1
    FROM urls JOIN chain ON urls.id = chain.canonical_url_id
    WHERE chain.depth < $3
  )`

/**
 * The one canonical writer. Under the rewrite lock it rejects cycles, points each URL at the end of
 * its target's chain, repoints back-references, and clears the source's Hacker News references.
 * Callers commit; the Hacker News flag refresh is queued after that commit.
 */
export async function setCanonicalUrls(
  pairs: readonly CanonicalPair[],
  query: TransactionQuery,
): Promise<ResolvedCanonical[]> {
  if (pairs.length === 0) return []
  for (const pair of pairs) {
    if (pair.urlId === pair.canonicalUrlId) throw new Error('URL cannot be its own canonical')
  }
  // Canonical rewrites can otherwise observe uncommitted chains and create cycles or chains
  // beyond the readers' two-hop bound. Serialize only this short database transaction.
  await lockCanonicalUrlRewrites(query)

  const urlIds = pairs.map(pair => pair.urlId)
  const canonicalIds = pairs.map(pair => pair.canonicalUrlId)
  const chainValues = [urlIds, canonicalIds, MAX_CANONICAL_CHAIN_DEPTH]

  const cycle = await query<{ source_id: string }>(
    `/* setCanonicalUrl */ ${CHAIN_CTE}
    SELECT source_id FROM chain WHERE id = source_id LIMIT 1`,
    chainValues,
  )
  if (cycle.rows[0]) await throwCircularReference(cycle.rows[0].source_id, pairs, query)

  const resolved = await query<{ source_id: string; id: string }>(
    `/* resolveCanonicalTargets */ ${CHAIN_CTE}
    SELECT DISTINCT ON (source_id) source_id, id FROM chain
    WHERE canonical_url_id IS NULL ORDER BY source_id, depth DESC`,
    chainValues,
  )
  const finalById = new Map(resolved.rows.map(row => [row.source_id, row.id]))
  const results = pairs.map(pair => {
    const finalCanonicalId = finalById.get(pair.urlId)
    if (!finalCanonicalId)
      throw new Error(`Cannot resolve canonical URL for ${pair.canonicalUrlId}`)
    return { urlId: pair.urlId, finalCanonicalId }
  })
  const finalIds = results.map(result => result.finalCanonicalId)

  await rewriteCanonicalPointers(urlIds, finalIds, query)
  await removeSourceHackerNewsReferences(urlIds, query)
  registerPostCommitAction(query, async () => {
    await enqueueHackerNewsFlagsBestEffort([...new Set([...urlIds, ...canonicalIds, ...finalIds])])
  })
  return results
}

/** Points each source at its final target, then repoints every direct back-reference to it. */
async function rewriteCanonicalPointers(
  urlIds: string[],
  finalIds: string[],
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* setCanonicalUrl */
    UPDATE urls SET canonical_url_id = input.final_id
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, final_id)
    WHERE urls.id = input.url_id`,
    [urlIds, finalIds],
  )
  await query(
    `/* flattenCanonicalChain */
    -- no-mistakes-disable-next-line postgres-bounded-statements: every direct back-reference must be repointed in this transaction to preserve one-hop canonical resolution at commit; the number of referencing URLs is uncapped, so a LIMIT would leave stale canonical chains.
    UPDATE urls SET canonical_url_id = input.final_id
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, final_id)
    WHERE urls.canonical_url_id = input.url_id AND urls.id <> input.url_id`,
    [urlIds, finalIds],
  )
}

/** The URL row lock also fences refreshes: the writer skips URLs that gained a canonical. */
async function removeSourceHackerNewsReferences(
  sourceIds: string[],
  query: TransactionQuery,
): Promise<void> {
  // Take the totals lock before item locks, matching refreshes and retention.
  // ast-grep-ignore: no-three-sequential-awaits -- totals must lock before child deletion on the same transaction connection.
  await query(
    `/* removeCanonicalSourceHackerNewsTotals */
    DELETE FROM url_hacker_news_totals WHERE url_id = ANY($1::uuid[])`,
    [sourceIds],
  )
  await removeSourceItems('url_hacker_news_stories', hackerNewsReferenceMaxValues.stories_per_url)
  await removeSourceItems('url_hacker_news_comments', hackerNewsReferenceMaxValues.comments_per_url)

  async function removeSourceItems(table: string, limit: number) {
    await query(
      `/* removeCanonicalSourceHackerNewsReferences */
      WITH candidates AS (
        SELECT item.url_id, item.hacker_news_item_id
        FROM unnest($1::uuid[]) AS source(url_id)
        CROSS JOIN LATERAL (
          SELECT url_id, hacker_news_item_id FROM ${table}
          WHERE url_id = source.url_id ORDER BY hacker_news_item_id LIMIT $2
        ) AS item
      )
      DELETE FROM ${table} AS removed
      USING candidates
      WHERE removed.url_id = candidates.url_id
        AND removed.hacker_news_item_id = candidates.hacker_news_item_id`,
      [sourceIds, limit],
    )
  }
}

async function throwCircularReference(
  sourceId: string,
  pairs: readonly CanonicalPair[],
  query: TransactionQuery,
): Promise<never> {
  const targetId = pairs.find(pair => pair.urlId === sourceId)!.canonicalUrlId
  const urlData = await query<{ id: string; url: string }>(
    `/* getCanonicalCycleUrls */ SELECT id, url FROM urls WHERE id = ANY($1)`,
    [[sourceId, targetId]],
  )
  const urlMap = new Map(urlData.rows.map(row => [row.id, row.url]))
  throw new CircularCanonicalReferenceError(
    urlMap.get(sourceId) || sourceId,
    urlMap.get(targetId) || targetId,
  )
}
