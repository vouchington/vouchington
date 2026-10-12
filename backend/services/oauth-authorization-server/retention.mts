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
  const allowances = OAUTH_RETENTION_DELETE_ORDER.map(
    (_, index) => share + (index === 0 ? remainder : 0),
  )
  let deleted = 0
  let phase = 0
  let redistributing = false
  let lastBatchFull = false
  for (let batch = 0; batch < maxBatches && deleted < budget; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- one committed transaction per physical batch
    await using query = await beginTransaction()
    let remaining = batchSize
    while (remaining > 0 && deleted < budget) {
      if (phase === OAUTH_RETENTION_DELETE_ORDER.length) {
        if (redistributing) break
        redistributing = true
        phase = 0
      }
      const table = OAUTH_RETENTION_DELETE_ORDER[phase]!
      const limit = redistributing ? remaining : Math.min(remaining, allowances[phase]!)
      if (limit === 0) {
        phase++
        continue
      }
      // oxlint-disable-next-line no-await-in-loop -- each phase shares this batch's row cap
      const count = await (table === 'oauth_refresh_token_families'
        ? deleteExpiredFamilyPhaseRows(query, window, limit)
        : deleteExpiredRows(query, table, window, limit))
      deleted += count
      remaining -= count
      if (!redistributing) allowances[phase]! -= count
      if (redistributing || count < limit || allowances[phase] === 0) phase++
    }
    // oxlint-disable-next-line no-await-in-loop -- release this batch's locks before the next one
    await query.commit()
    lastBatchFull = remaining === 0
    if (redistributing) {
      if (phase === OAUTH_RETENTION_DELETE_ORDER.length && remaining > 0) break
      phase = 0
    }
    if (remaining === batchSize) break
  }
  return { deleted, hasMore: deleted === budget || lastBatchFull }
}

async function deleteExpiredFamilyPhaseRows(
  query: TransactionQuery,
  window: RetentionWindow,
  limit: number,
): Promise<number> {
  // Expired-family access children precede refresh children in FK order, then empty families.
  let deleted = await deleteExpiredOAuthRetentionTokens(
    query,
    'oauth_access_tokens',
    window,
    limit,
    'family',
  )
  if (deleted < limit)
    deleted += await deleteExpiredOAuthRetentionTokens(
      query,
      'oauth_refresh_tokens',
      window,
      limit - deleted,
      'family',
    )
  if (deleted < limit) deleted += await deleteEmptyFamilies(query, window, limit - deleted)
  if (deleted < limit)
    deleted += await deleteExpiredOAuthRetentionTokens(
      query,
      'oauth_refresh_tokens',
      window,
      limit - deleted,
      'independent-nonfamily',
    )
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
