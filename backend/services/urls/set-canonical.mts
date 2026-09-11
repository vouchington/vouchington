import { read, beginTransaction } from '@data-stores/psql'

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

async function getCanonicalCycleUrls(urlId: string, canonicalUrlId: string) {
  const urlData = await read(
    `/* getCanonicalCycleUrls */ SELECT id, url FROM urls WHERE id = ANY($1)`,
    [[urlId, canonicalUrlId]],
  )
  return new Map(urlData.rows.map((row: { id: string; url: string }) => [row.id, row.url]))
}

export const setCanonicalUrl = async (urlId: string, canonicalUrlId: string): Promise<void> => {
  // Prevent self-reference
  if (urlId === canonicalUrlId) {
    throw new Error('URL cannot be its own canonical')
  }

  // Check for circular reference using recursive CTE
  // Pattern from: /backend/services/posts/search/query-builder.mts:58-79
  const cycleCheck = await read(
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
    const urlMap = await getCanonicalCycleUrls(urlId, canonicalUrlId)
    const sourceUrl = urlMap.get(urlId) || urlId
    const targetUrl = urlMap.get(canonicalUrlId) || canonicalUrlId

    throw new CircularCanonicalReferenceError(sourceUrl, targetUrl)
  }

  // Resolve the final canonical target (in case canonicalUrlId itself has a canonical)
  const resolved = await read(
    `/* resolveCanonicalTarget */ WITH RECURSIVE chain AS (
      SELECT id, canonical_url_id, 0 AS depth FROM urls WHERE id = $1
      UNION ALL
      SELECT u.id, u.canonical_url_id, c.depth + 1
      FROM urls u JOIN chain c ON u.id = c.canonical_url_id
      WHERE c.canonical_url_id IS NOT NULL AND c.depth < $2
    ) SELECT id FROM chain WHERE canonical_url_id IS NULL ORDER BY depth DESC LIMIT 1`,
    [canonicalUrlId, MAX_CANONICAL_CHAIN_DEPTH],
  )
  const finalCanonicalId = resolved.rows[0]?.id ?? canonicalUrlId

  // Atomically set canonical_url_id and flatten any back-references
  await using query = await beginTransaction()
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
      `/* flattenCanonicalChain */ UPDATE urls SET canonical_url_id = $1 WHERE canonical_url_id = $2 AND id != $3`,
      [finalCanonicalId, urlId, urlId],
    )
  }
  await query.commit()
}
