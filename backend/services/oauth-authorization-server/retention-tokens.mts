import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'

type TokenTable = 'oauth_access_tokens' | 'oauth_refresh_tokens'
const TOKEN_TABLES: ReadonlySet<string> = new Set(['oauth_access_tokens', 'oauth_refresh_tokens'])

export async function deleteExpiredOAuthRetentionTokens(
  query: TransactionQuery,
  table: TokenTable,
  window: { lowerBoundDate?: Date; now: Date },
  limit: number,
): Promise<number> {
  const tokenTable = assertWhitelistedSqlIdentifier(
    table,
    TOKEN_TABLES,
    'OAuth retention token table',
  )
  const familyColumn = table === 'oauth_access_tokens' ? 'refresh_family_id' : 'family_id'
  // Never invoke SET NULL against a predecessor the retention transaction did not lock.
  const noPredecessor =
    table === 'oauth_refresh_tokens'
      ? `AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens AS predecessor
         WHERE predecessor.replaced_by_token_id = artifact.id)`
      : ''
  const families = await query<{ id: string }>(
    `/* lockOAuthRetentionTokenFamilies */
     /* deadlock-safe: family candidates use ordered SKIP LOCKED; child probes acquire no locks. */
     SELECT family.id
     FROM oauth_refresh_token_families AS family
     WHERE family.expires_at <= $1
       AND ($2::timestamptz IS NULL OR family.expires_at >= $2)
       AND EXISTS (SELECT 1 FROM ${tokenTable} AS artifact
         WHERE artifact.${familyColumn} = family.id ${noPredecessor})
     ORDER BY family.expires_at, family.id
     LIMIT 1 FOR UPDATE OF family SKIP LOCKED`,
    [window.now, window.lowerBoundDate ?? null],
  )
  const fromFamilies = await query(
    `/* deleteOAuthRetentionFamilyTokens */
     /* deadlock-safe: family locks and token locks skip held rows; refresh replacements
        with any surviving predecessor are excluded, so SET NULL cannot wait on that predecessor. */
     WITH candidates AS MATERIALIZED (
       SELECT artifact.id FROM unnest($1::uuid[]) AS family(id)
       CROSS JOIN LATERAL (
         SELECT artifact.id FROM ${tokenTable} AS artifact
         WHERE artifact.${familyColumn} = family.id ${noPredecessor}
         ORDER BY artifact.id LIMIT $2
         FOR UPDATE OF artifact SKIP LOCKED
       ) AS artifact
       ORDER BY artifact.id LIMIT $2
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
    [families.rows.map(row => row.id), limit],
  )
  const deleted = fromFamilies.rowCount ?? 0
  if (deleted === limit) return deleted
  const independentlyExpired = await query(
    `/* deleteOAuthRetentionExpiredTokens */
     /* deadlock-safe: ordered token locks skip held rows; surviving predecessors exclude replacements. */
     WITH candidates AS MATERIALIZED (
       SELECT artifact.id FROM ${tokenTable} AS artifact
       WHERE artifact.expires_at <= $1
         AND ($2::timestamptz IS NULL OR artifact.expires_at >= $2)
         ${noPredecessor}
       ORDER BY artifact.expires_at, artifact.id LIMIT $3
       FOR UPDATE OF artifact SKIP LOCKED
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
    [window.now, window.lowerBoundDate ?? null, limit - deleted],
  )
  return deleted + (independentlyExpired.rowCount ?? 0)
}
