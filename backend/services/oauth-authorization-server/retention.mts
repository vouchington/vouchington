import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  type TransactionQuery,
} from '@data-stores/psql'

export type OAuthAuthorizationServerRetentionResult = {
  deleted: number
  hasMore: boolean
}

export async function deleteExpiredOAuthAuthorizationServerArtifactsBatch(
  batchSize: number,
  options: { lowerBoundDate?: Date; now?: Date } = {},
): Promise<OAuthAuthorizationServerRetentionResult> {
  const now = options.now ?? new Date()
  await using query = await beginTransaction()
  const requestCount = await deleteExpiredRows(
    query,
    'oauth_authorization_requests',
    now,
    options.lowerBoundDate,
    batchSize,
  )
  const codeCount = await deleteExpiredRows(
    query,
    'oauth_authorization_codes',
    now,
    options.lowerBoundDate,
    batchSize,
  )
  const accessCount = await deleteExpiredRows(
    query,
    'oauth_access_tokens',
    now,
    options.lowerBoundDate,
    batchSize,
  )
  const familyCount = await deleteExpiredRows(
    query,
    'oauth_refresh_token_families',
    now,
    options.lowerBoundDate,
    batchSize,
  )
  await query.commit()
  const counts = [requestCount, codeCount, accessCount, familyCount]
  return {
    deleted: counts.reduce((total, count) => total + count, 0),
    hasMore: counts.some(count => count === batchSize),
  }
}

type ExpiringOAuthTable =
  | 'oauth_access_tokens'
  | 'oauth_authorization_codes'
  | 'oauth_authorization_requests'
  | 'oauth_refresh_token_families'

const EXPIRING_OAUTH_TABLES: ReadonlySet<string> = new Set<ExpiringOAuthTable>([
  'oauth_access_tokens',
  'oauth_authorization_codes',
  'oauth_authorization_requests',
  'oauth_refresh_token_families',
])

async function deleteExpiredRows(
  query: TransactionQuery,
  table: ExpiringOAuthTable,
  now: Date,
  lowerBoundDate: Date | undefined,
  batchSize: number,
): Promise<number> {
  const validatedTable = assertWhitelistedSqlIdentifier(
    table,
    EXPIRING_OAUTH_TABLES,
    'OAuth authorization-server retention table',
  )
  const result = await query(
    `/* deleteExpiredOAuthAuthorizationServerArtifactsBatch:${validatedTable} */
     DELETE FROM ${validatedTable}
     WHERE id IN (
       SELECT id
       FROM ${validatedTable}
       WHERE expires_at <= $1
         AND ($2::timestamptz IS NULL OR expires_at >= $2)
       ORDER BY expires_at ASC, id ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )`,
    [now, lowerBoundDate ?? null, batchSize],
  )
  return result.rowCount ?? 0
}
