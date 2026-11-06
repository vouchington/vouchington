import type { TransactionQuery } from '@data-stores/psql/types'

/** Readers share the rewrite fence before taking hostname or URL row locks. */
export async function lockCanonicalUrlRewrites(
  query: TransactionQuery,
  mode: 'shared' | 'exclusive' = 'exclusive',
): Promise<void> {
  await query(
    mode === 'shared'
      ? `/* lockCanonicalUrlRewritesShared */ SELECT pg_advisory_xact_lock_shared(hashtextextended('url-canonicalization', 0))`
      : `/* lockCanonicalUrlRewrites */ SELECT pg_advisory_xact_lock(hashtextextended('url-canonicalization', 0))`,
  )
}
