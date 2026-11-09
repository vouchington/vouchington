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

/**
 * `promoteVariantTarget` marks a target that was linked as a variant of the source: an authoritative
 * redirect makes the target the root again, instead of rejecting the reversed pointer as a cycle.
 */
export type CanonicalPair = {
  urlId: string
  canonicalUrlId: string
  promoteVariantTarget?: boolean
}
export type ResolvedCanonical = { urlId: string; finalCanonicalId: string }

/**
 * The one canonical writer. The terminal-root FK rejects cycles and chains while this writer
 * repoints back-references before each source ceases to be a terminal root.
 * Callers commit; the Hacker News flag refresh is queued after that commit.
 */
export async function writeCanonicalUrl(
  input: CanonicalPair,
  query: TransactionQuery,
): Promise<ResolvedCanonical> {
  if (input.urlId === input.canonicalUrlId) throw new Error('URL cannot be its own canonical')
  const pairs = [input]
  await promoteVariantTargets(input.promoteVariantTarget ? pairs : [], query)

  const urlIds = pairs.map(pair => pair.urlId)
  const canonicalIds = pairs.map(pair => pair.canonicalUrlId)
  const resolved = await query<{ source_id: string; final_id: string }>(
    `/* resolveCanonicalTargets */
    SELECT input.url_id AS source_id,
      COALESCE(target.canonical_url_id, target.id) AS final_id
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, canonical_url_id)
    JOIN urls target ON target.id = input.canonical_url_id`,
    [urlIds, canonicalIds],
  )
  const finalById = new Map(resolved.rows.map(row => [row.source_id, row.final_id]))
  const results = pairs.map(pair => {
    const finalCanonicalId = finalById.get(pair.urlId)
    if (!finalCanonicalId)
      throw new Error(`Cannot resolve canonical URL for ${pair.canonicalUrlId}`)
    return { urlId: pair.urlId, finalCanonicalId }
  })
  const cycle = results.find(result => result.urlId === result.finalCanonicalId)
  if (cycle) await throwCircularReference(cycle.urlId, pairs, query)
  const finalIds = results.map(result => result.finalCanonicalId)

  // ast-grep-ignore: no-three-sequential-awaits -- the root FK requires incoming aliases to move before the root key changes; Hacker News cleanup follows that mutation on the same transaction.
  await flattenCanonicalBackReferences(urlIds, finalIds, query)
  await rewriteCanonicalPointers(urlIds, finalIds, query)
  await removeSourceHackerNewsReferences(urlIds, query)
  registerPostCommitAction(query, async () => {
    await enqueueHackerNewsFlagsBestEffort([...new Set([...urlIds, ...canonicalIds, ...finalIds])])
  })
  return results[0]!
}

async function promoteVariantTargets(
  pairs: readonly CanonicalPair[],
  query: TransactionQuery,
): Promise<void> {
  if (pairs.length === 0) return
  await query(
    `/* promoteCanonicalVariantTargets */
    UPDATE urls SET canonical_url_id = NULL
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, canonical_url_id)
    WHERE urls.id = input.canonical_url_id AND urls.canonical_url_id = input.url_id`,
    [pairs.map(pair => pair.urlId), pairs.map(pair => pair.canonicalUrlId)],
  )
}

/** An alias can stop referencing a root only before that root ceases to be terminal. */
async function flattenCanonicalBackReferences(
  urlIds: string[],
  finalIds: string[],
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* flattenCanonicalChain */
    -- no-mistakes-disable-next-line postgres-bounded-statements: every direct back-reference must be repointed in this transaction to preserve the canonical-root FK at commit; the number of referencing URLs is uncapped.
    UPDATE urls SET canonical_url_id = input.final_id
    FROM unnest($1::uuid[], $2::uuid[]) AS input(url_id, final_id)
    WHERE urls.canonical_url_id = input.url_id AND urls.id <> input.url_id`,
    [urlIds, finalIds],
  )
}

/** Points each source at its final terminal target. */
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
