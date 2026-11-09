import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'
import { writeCanonicalUrl } from './set-canonical-batch.mts'
import { retryCanonicalWrite } from './canonical-write-retry.mts'
import { write, beginTransaction } from '@data-stores/psql'

export { CircularCanonicalReferenceError } from './set-canonical-batch.mts'

/** Returns the canonical target after commit so callers can schedule a fresh lookup for it. */
export const setCanonicalUrl = async (
  urlId: string,
  canonicalUrlId: string,
  options: { promoteVariantTarget?: boolean } = {},
): Promise<string> => {
  await retryCanonicalWrite(() => persistCanonicalRewrite(urlId, canonicalUrlId, options))

  // Another canonical rewrite can retarget this URL after commit. Read the primary, and let
  // lookup workers resolve again when they execute a queued lookup.
  const resolvedId = await resolveCanonicalTarget(urlId)
  await enqueueMissingHackerNewsLookups([resolvedId], { query: write })
  return resolvedId
}

async function persistCanonicalRewrite(
  urlId: string,
  canonicalUrlId: string,
  options: { promoteVariantTarget?: boolean },
): Promise<void> {
  await using query = await beginTransaction()
  await writeCanonicalUrl({ urlId, canonicalUrlId, ...options }, query)
  await query.commit()
}

async function resolveCanonicalTarget(urlId: string): Promise<string> {
  const resolved = await write<{ id: string }>(
    `/* resolveCanonicalTarget */
      SELECT COALESCE(canonical_url_id, id) AS id FROM urls WHERE id = $1`,
    [urlId],
  )
  const resolvedId = resolved.rows[0]?.id
  if (!resolvedId) throw new Error(`Cannot resolve canonical URL for ${urlId}`)
  return resolvedId
}
