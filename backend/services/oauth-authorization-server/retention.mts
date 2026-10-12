import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  type TransactionQuery,
} from '@data-stores/psql'
import { deleteExpiredOAuthRetentionTokens } from './retention-tokens.mts'

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

type ExpiringOAuthTable = (typeof OAUTH_RETENTION_DELETE_ORDER)[number] | 'oauth_refresh_tokens'
const EXPIRING_OAUTH_TABLES: ReadonlySet<string> = new Set([
  ...OAUTH_RETENTION_DELETE_ORDER,
  'oauth_refresh_tokens',
])
type RetentionWindow = { lowerBoundDate?: Date; now: Date }

export async function deleteExpiredOAuthAuthorizationServerArtifacts(
  batchSize: number,
  options: { lowerBoundDate?: Date; now?: Date; maxBatches?: number } = {},
): Promise<OAuthAuthorizationServerRetentionResult> {
  const maxBatches = options.maxBatches ?? 1
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1)
    throw new RangeError('maxBatches must be a positive safe integer')
  const budget = batchSize * maxBatches
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    !Number.isSafeInteger(budget) ||
    budget < 1
  )
    throw new RangeError('OAuth artifact retention requires a positive safe integer budget')
  const window = { lowerBoundDate: options.lowerBoundDate, now: options.now ?? new Date() }
  const share = Math.floor(budget / OAUTH_RETENTION_DELETE_ORDER.length)
  const remainder = budget % OAUTH_RETENTION_DELETE_ORDER.length
  let deleted = 0
  for (const [index, table] of OAUTH_RETENTION_DELETE_ORDER.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- reserve each phase a share before redistributing in FK order
    deleted += await deletePhase(table, window, batchSize, share + (index === 0 ? remainder : 0))
  }
  while (deleted < budget) {
    const before = deleted
    for (const table of OAUTH_RETENTION_DELETE_ORDER) {
      if (deleted === budget) break
      // oxlint-disable-next-line no-await-in-loop -- child-first deletes consume one shared physical-row budget
      deleted += await deletePhase(table, window, batchSize, budget - deleted)
    }
    if (deleted === before) break
  }
  return { deleted, hasMore: deleted === budget }
}

async function deletePhase(
  table: (typeof OAUTH_RETENTION_DELETE_ORDER)[number],
  window: RetentionWindow,
  batchSize: number,
  allowance: number,
): Promise<number> {
  let deleted = 0
  while (deleted < allowance) {
    const limit = Math.min(batchSize, allowance - deleted)
    // oxlint-disable-next-line no-await-in-loop -- commit each bounded physical-row batch independently
    await using query = await beginTransaction()
    // oxlint-disable-next-line no-await-in-loop -- each statement remains capped within the phase allowance
    const count = await deleteExpiredRows(
      query,
      table === 'oauth_refresh_token_families' ? 'oauth_refresh_tokens' : table,
      window,
      limit,
    )
    let families = 0
    if (table === 'oauth_refresh_token_families' && count < limit) {
      // oxlint-disable-next-line no-await-in-loop -- counted children precede locked empty families within this batch
      families = await deleteEmptyFamilies(query, window, limit - count)
    }
    // oxlint-disable-next-line no-await-in-loop -- release this batch's locks before another bounded batch
    await query.commit()
    deleted += count + families
    if (count + families < limit) break
  }
  return deleted
}

async function deleteExpiredRows(
  query: TransactionQuery,
  table: ExpiringOAuthTable,
  window: RetentionWindow,
  limit: number,
): Promise<number> {
  const validatedTable = assertWhitelistedSqlIdentifier(
    table,
    EXPIRING_OAUTH_TABLES,
    'OAuth authorization-server retention table',
  )
  if (table === 'oauth_access_tokens' || table === 'oauth_refresh_tokens')
    return deleteExpiredOAuthRetentionTokens(query, table, window, limit)
  const result = await query(
    `/* deleteExpiredOAuthAuthorizationServerArtifacts:${validatedTable} */
     /* deadlock-safe: ordered token/request/code rows use SKIP LOCKED; empty-family
        locks are also skipped, so retention never waits behind a family-first writer. */
     WITH candidates AS MATERIALIZED (
       SELECT artifact.id FROM ${validatedTable} AS artifact
       WHERE (artifact.expires_at <= $1
         AND ($2::timestamptz IS NULL OR artifact.expires_at >= $2))
       ORDER BY artifact.expires_at ASC, artifact.id ASC
       LIMIT $3
       FOR UPDATE OF artifact SKIP LOCKED
     )
     DELETE FROM ${validatedTable} target USING candidates WHERE target.id = candidates.id`,
    [window.now, window.lowerBoundDate ?? null, limit],
  )
  return result.rowCount ?? 0
}

async function deleteEmptyFamilies(
  query: TransactionQuery,
  window: RetentionWindow,
  limit: number,
): Promise<number> {
  // Lock first, then check children in a fresh statement snapshot. FK inserts cannot race the delete.
  const candidates = await query<{ id: string }>(
    `/* deleteEmptyOAuthFamilies lock */ SELECT family.id
     FROM oauth_refresh_token_families AS family
     WHERE family.expires_at <= $1
       AND ($2::timestamptz IS NULL OR family.expires_at >= $2)
       AND NOT EXISTS (SELECT 1 FROM oauth_access_tokens WHERE refresh_family_id = family.id)
       AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens WHERE family_id = family.id)
     ORDER BY family.expires_at ASC, family.id ASC
     LIMIT $3 FOR UPDATE OF family SKIP LOCKED`,
    [window.now, window.lowerBoundDate ?? null, limit],
  )
  if (candidates.rows.length === 0) return 0
  const result = await query(
    `/* deleteEmptyOAuthFamilies */ DELETE FROM oauth_refresh_token_families AS family
     WHERE family.id = ANY($1::uuid[])
       AND NOT EXISTS (SELECT 1 FROM oauth_access_tokens WHERE refresh_family_id = family.id)
       AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens WHERE family_id = family.id)`,
    [candidates.rows.map(row => row.id)],
  )
  return result.rowCount ?? 0
}
