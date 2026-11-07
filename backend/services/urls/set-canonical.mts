import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'
import { setCanonicalUrls } from './set-canonical-batch.mts'
import { write, beginTransaction } from '@data-stores/psql'

export { CircularCanonicalReferenceError } from './set-canonical-batch.mts'

const MAX_CANONICAL_CHAIN_DEPTH = 10

/** Returns the canonical target after commit so callers can schedule a fresh lookup for it. */
export const setCanonicalUrl = async (
  urlId: string,
  canonicalUrlId: string,
  options: { promoteVariantTarget?: boolean } = {},
): Promise<string> => {
  await using query = await beginTransaction()
  await setCanonicalUrls([{ urlId, canonicalUrlId, ...options }], query)
  await query.commit()

  // Another canonical rewrite can retarget this URL after commit. Read the primary, and let
  // lookup workers resolve again when they execute a queued lookup.
  const resolvedId = await resolveCanonicalTarget(urlId)
  await enqueueMissingHackerNewsLookups([resolvedId], { query: write })
  return resolvedId
}

async function resolveCanonicalTarget(urlId: string): Promise<string> {
  const resolved = await write<{ id: string }>(
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
