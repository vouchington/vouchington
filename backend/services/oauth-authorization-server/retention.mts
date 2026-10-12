import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  type TransactionQuery,
} from '@data-stores/psql'

export type OAuthAuthorizationServerRetentionResult = {
  deleted: number
  hasMore: boolean
}

const OAUTH_RETENTION_DELETE_ORDER = [
  'oauth_authorization_requests',
  'oauth_authorization_codes',
  'oauth_access_tokens',
  'oauth_refresh_token_families',
] as const

type ExpiringOAuthTable = (typeof OAUTH_RETENTION_DELETE_ORDER)[number]

const EXPIRING_OAUTH_TABLES: ReadonlySet<string> = new Set(OAUTH_RETENTION_DELETE_ORDER)

export async function deleteExpiredOAuthAuthorizationServerArtifactsBatch(
  batchSize: number,
  options: { lowerBoundDate?: Date; now?: Date } = {},
): Promise<OAuthAuthorizationServerRetentionResult> {
  const now = options.now ?? new Date()
  await using query = await beginTransaction()
  let deleted = 0
  let hasMore = false
  for (const table of OAUTH_RETENTION_DELETE_ORDER) {
    const remaining = batchSize - deleted
    if (remaining === 0) {
      hasMore = true
      break
    }
    // oxlint-disable-next-line no-await-in-loop -- child-table deletes must commit in FK order
    const count = await deleteExpiredRows(query, table, now, options.lowerBoundDate, remaining)
    deleted += count
    hasMore ||= count === remaining
  }
  await query.commit()
  return { deleted, hasMore }
}

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
