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
  if (table === 'oauth_refresh_tokens')
    return deleteExpiredRefreshTokens(query, window, limit, familyIds, includeOwnExpiry)
  const tokenTable = assertWhitelistedSqlIdentifier(
    table,
    TOKEN_TABLES,
    'OAuth retention token table',
  )
  const fromFamilies =
    familyIds.length === 0
      ? { rowCount: 0 }
      : await query(
          `/* deleteOAuthRetentionFamilyTokens */
     /* deadlock-safe: the indexed page bounds child locks before deletion. */
     WITH page AS MATERIALIZED (
       SELECT artifact.id FROM ${tokenTable} AS artifact
       WHERE artifact.refresh_family_id = ANY($1::uuid[])
       ORDER BY artifact.refresh_family_id, artifact.id LIMIT $2
     ), candidates AS MATERIALIZED (
       SELECT locked.id FROM page
       CROSS JOIN LATERAL (
         SELECT artifact.id FROM ${tokenTable} AS artifact
         WHERE artifact.id = page.id
         FOR UPDATE OF artifact SKIP LOCKED
       ) AS locked
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
          [familyIds, limit],
        )
  const deleted = fromFamilies.rowCount ?? 0
  if (!includeOwnExpiry || deleted === limit) return deleted
  const independentlyExpired = await query(
    `/* deleteOAuthRetentionExpiredTokens */
     /* deadlock-safe: the expiry-index page bounds child locks before deletion. */
     WITH page AS MATERIALIZED (
       SELECT artifact.id FROM ${tokenTable} AS artifact
       WHERE artifact.expires_at <= $1
         AND ($2::timestamptz IS NULL OR artifact.expires_at >= $2)
       ORDER BY artifact.expires_at, artifact.id LIMIT $3
     ), candidates AS MATERIALIZED (
       SELECT locked.id FROM page
       CROSS JOIN LATERAL (
         SELECT artifact.id FROM ${tokenTable} AS artifact
         WHERE artifact.id = page.id
         FOR UPDATE OF artifact SKIP LOCKED
       ) AS locked
     ) DELETE FROM ${tokenTable} AS target USING candidates WHERE target.id = candidates.id`,
    [window.now, window.lowerBoundDate ?? null, limit - deleted],
  )
  return deleted + (independentlyExpired.rowCount ?? 0)
}

async function deleteExpiredRefreshTokens(
  query: TransactionQuery,
  window: { lowerBoundDate?: Date; now: Date },
  limit: number,
  familyIds: readonly string[],
  includeOwnExpiry: boolean,
): Promise<number> {
  const familyDeleted =
    familyIds.length === 0
      ? 0
      : await deleteRefreshTokenPage(query, { kind: 'family', ids: familyIds }, limit)
  if (!includeOwnExpiry || familyDeleted === limit) return familyDeleted
  return (
    familyDeleted +
    (await deleteRefreshTokenPage(query, { kind: 'expiry', window }, limit - familyDeleted))
  )
}

async function deleteRefreshTokenPage(
  query: TransactionQuery,
  source:
    | { kind: 'family'; ids: readonly string[] }
    | { kind: 'expiry'; window: { lowerBoundDate?: Date; now: Date } },
  limit: number,
): Promise<number> {
  const fromFamily = source.kind === 'family'
  // A replacement UUID can sort before its predecessor on another API replica.
  // Page by the stored generation, then lock at most the page's rows in that order.
  const pageSql = fromFamily
    ? `/* lockOAuthRetentionFamilyRefreshPage */
       WITH page AS MATERIALIZED (
         SELECT artifact.id, artifact.family_id, artifact.generation
         FROM oauth_refresh_tokens AS artifact
         WHERE artifact.family_id = ANY($1::uuid[])
         ORDER BY artifact.family_id, artifact.generation, artifact.id LIMIT $2
       )
       SELECT token.id FROM page
       JOIN oauth_refresh_tokens AS token ON token.id = page.id
       ORDER BY page.family_id, page.generation, page.id
       FOR UPDATE OF token SKIP LOCKED`
    : `/* lockOAuthRetentionExpiredRefreshPage */
       WITH page AS MATERIALIZED (
         SELECT artifact.id, artifact.expires_at, artifact.family_id, artifact.generation
         FROM oauth_refresh_tokens AS artifact
         WHERE artifact.expires_at <= $1
           AND ($2::timestamptz IS NULL OR artifact.expires_at >= $2)
         ORDER BY artifact.expires_at, artifact.family_id, artifact.generation, artifact.id
         LIMIT $3
       )
       SELECT token.id FROM page
       JOIN oauth_refresh_tokens AS token ON token.id = page.id
       ORDER BY page.expires_at, page.family_id, page.generation, page.id
       FOR UPDATE OF token SKIP LOCKED`
  const params =
    source.kind === 'family'
      ? [source.ids, limit]
      : [source.window.now, source.window.lowerBoundDate ?? null, limit]
  const page = await query<{ id: string }>(pageSql, params)
  if (page.rows.length === 0) return 0
  const ids = page.rows.map(row => row.id)
  // Recheck predecessors in a fresh statement after every candidate is locked.
  // Only roots and their locked, uniquely-preceded successors may be deleted;
  // a skipped or surviving predecessor cannot trigger SET NULL on a held row.
  const removed = await query(
    `/* deleteOAuthRetentionRefreshChainPage */
     WITH RECURSIVE locked AS MATERIALIZED (
       SELECT token.id, token.replaced_by_token_id
       FROM oauth_refresh_tokens AS token WHERE token.id = ANY($1::uuid[])
     ), eligible AS (
       SELECT token.id, token.replaced_by_token_id FROM locked AS token
       LEFT JOIN LATERAL (
         SELECT predecessor.id FROM oauth_refresh_tokens AS predecessor
         WHERE predecessor.replaced_by_token_id = token.id LIMIT 1
       ) AS blocker ON true
       WHERE blocker.id IS NULL
       UNION ALL
       SELECT successor.id, successor.replaced_by_token_id
       FROM eligible AS predecessor
       JOIN locked AS successor ON successor.id = predecessor.replaced_by_token_id
       LEFT JOIN LATERAL (
         SELECT other.id FROM oauth_refresh_tokens AS other
         WHERE other.replaced_by_token_id = successor.id AND other.id <> predecessor.id
         LIMIT 1
       ) AS blocker ON true
       WHERE blocker.id IS NULL
     )
     DELETE FROM oauth_refresh_tokens AS target
     USING eligible WHERE target.id = eligible.id`,
    [ids],
  )
  return removed.rowCount ?? 0
}
