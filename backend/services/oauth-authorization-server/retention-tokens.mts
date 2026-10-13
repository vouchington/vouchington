import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'

type TokenTable = 'oauth_access_tokens' | 'oauth_refresh_tokens'
const TOKEN_TABLES: ReadonlySet<string> = new Set(['oauth_access_tokens', 'oauth_refresh_tokens'])

export async function lockExpiredOAuthRetentionFamilies(
  query: TransactionQuery,
  window: { lowerBoundDate?: Date; now: Date },
  limit: number,
): Promise<string[]> {
  // Page the expiry index before inspecting children. An EXISTS filter here would rescan
  // arbitrarily many earlier empty families to find one with a child.
  const families = await query<{ id: string }>(
    `/* lockExpiredOAuthRetentionFamilies */
     /* Bound expiry-index reads before skipping held family rows. */
     WITH page AS MATERIALIZED (
       SELECT family.id, family.expires_at FROM oauth_refresh_token_families AS family
       WHERE family.expires_at <= $1
         AND ($2::timestamptz IS NULL OR family.expires_at >= $2)
       ORDER BY family.expires_at, family.id LIMIT $3
     )
     SELECT family.id FROM page
     JOIN oauth_refresh_token_families AS family ON family.id = page.id
     ORDER BY page.expires_at, page.id
     FOR UPDATE OF family SKIP LOCKED`,
    [window.now, window.lowerBoundDate ?? null, limit],
  )
  return families.rows.map(row => row.id)
}

export async function deleteExpiredOAuthRetentionTokens(
  query: TransactionQuery,
  table: TokenTable,
  window: { lowerBoundDate?: Date; now: Date },
  limit: number,
  familyIds: readonly string[],
  includeOwnExpiry = true,
): Promise<number> {
  const tokenTable = assertWhitelistedSqlIdentifier(
    table,
    TOKEN_TABLES,
    'OAuth retention token table',
  )
  const familyColumn = table === 'oauth_access_tokens' ? 'refresh_family_id' : 'family_id'
  // A replacement can have a lower UUID than its predecessor across API replicas. Refresh
  // generations are the chain order; page roots before replacements so a small limit progresses.
  const chainOrder = table === 'oauth_refresh_tokens' ? 'artifact.generation, ' : ''
  const expiryChainOrder =
    table === 'oauth_refresh_tokens' ? 'artifact.family_id, artifact.generation, ' : ''
  // Never invoke SET NULL against a predecessor the retention transaction did not lock.
  const noPredecessor =
    table === 'oauth_refresh_tokens'
      ? `AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens AS predecessor
         WHERE predecessor.replaced_by_token_id = artifact.id)`
      : ''
  const fromFamilies =
    familyIds.length === 0
      ? { rowCount: 0 }
      : await query(
          `/* deleteOAuthRetentionFamilyTokens */
     /* deadlock-safe: the index-ordered page bounds predecessor checks and gives each
        selected row one lock attempt; surviving predecessors avoid SET NULL waits. */
     WITH page AS MATERIALIZED (
       SELECT artifact.id FROM ${tokenTable} AS artifact
       WHERE artifact.${familyColumn} = ANY($1::uuid[])
       ORDER BY artifact.${familyColumn}, ${chainOrder}artifact.id LIMIT $2
     ), candidates AS MATERIALIZED (
       SELECT locked.id FROM page
       CROSS JOIN LATERAL (
         SELECT artifact.id FROM ${tokenTable} AS artifact
         WHERE artifact.id = page.id ${noPredecessor}
         FOR UPDATE OF artifact SKIP LOCKED
       ) AS locked
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
          [familyIds, limit],
        )
  const deleted = fromFamilies.rowCount ?? 0
  if (!includeOwnExpiry || deleted === limit) return deleted
  const independentlyExpired = await query(
    `/* deleteOAuthRetentionExpiredTokens */
     /* deadlock-safe: the expiry-index page bounds predecessor checks and gives each
        selected row one lock attempt; surviving predecessors avoid SET NULL waits. */
     WITH page AS MATERIALIZED (
       SELECT artifact.id FROM ${tokenTable} AS artifact
       WHERE artifact.expires_at <= $1
         AND ($2::timestamptz IS NULL OR artifact.expires_at >= $2)
       ORDER BY artifact.expires_at, ${expiryChainOrder}artifact.id LIMIT $3
     ), candidates AS MATERIALIZED (
       SELECT locked.id FROM page
       CROSS JOIN LATERAL (
         SELECT artifact.id FROM ${tokenTable} AS artifact
         WHERE artifact.id = page.id ${noPredecessor}
         FOR UPDATE OF artifact SKIP LOCKED
       ) AS locked
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
    [window.now, window.lowerBoundDate ?? null, limit - deleted],
  )
  return deleted + (independentlyExpired.rowCount ?? 0)
}
