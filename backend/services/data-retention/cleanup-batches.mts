import { assertWhitelistedSqlIdentifier, write } from '@data-stores/psql'
import { providerTableConfigs } from '@services/oauth/providers'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'
import { cleanupSoftDeletedUser } from './cleanup-soft-deleted-user.mts'
import { DEFAULT_DATA_RETENTION_CONFIG } from './config.mts'
export const DEFAULT_BATCH_SIZE = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const oauthProviderUserIdColumnByTable = new Map(
  Object.values(providerTableConfigs).map(config => [config.table, config.providerUserIdColumn]),
)
const allowedOAuthCleanupIdentifiers = new Set([...oauthProviderUserIdColumnByTable].flat())
const oauthAuthorizationProviderUserIdColumnByAccountTable = new Map([
  ['facebook_accounts', 'facebook_user_id'],
  ['github_accounts', 'github_user_id'],
  ['x_accounts', 'x_user_id'],
])
export async function cleanupSoftDeletedUserBatch(
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<{ deleted: number; hasMore: boolean }> {
  const targetQuery = sql`/* cleanupSoftDeletedUserBatch */
    SELECT id FROM users
    WHERE deleted_at IS NOT NULL
      AND deleted_at < ${cutoffDate}
      AND id <> ${DELETED_USER_ID}
      AND NOT EXISTS (
        SELECT 1
        FROM user_deletion_requests
        WHERE user_id = users.id
          AND completed_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM memberships membership
        INNER JOIN membership_administrator_refund_operation_requests request
          ON request.membership_id = membership.id
        INNER JOIN membership_operations operation
          ON operation.id = request.membership_operation_id
        WHERE membership.user_id = users.id
          AND operation.completed_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_legal_preservation_holds preservation_hold
        WHERE preservation_hold.account_user_id = users.id
          AND preservation_hold.released_at IS NULL
      )
  `
  if (lowerBoundDate !== undefined) targetQuery.append(sql` AND deleted_at >= ${lowerBoundDate}`)
  targetQuery.append(sql`
    ORDER BY deleted_at ASC, id ASC
    LIMIT ${batchSize}`)
  const { rows: targetRows } = await write<{ id: string }>(targetQuery)
  const budget = { remainingRows: batchSize }
  let deleted = 0
  let hasMore = targetRows.length === batchSize
  for (const { id: targetId } of targetRows) {
    if (budget.remainingRows === 0) {
      hasMore = true
      break
    }
    const before = budget.remainingRows
    // oxlint-disable-next-line no-await-in-loop -- each independently selected user commits before the next may block.
    const result = await cleanupSoftDeletedUser(
      targetId,
      cutoffDate,
      lowerBoundDate,
      batchSize,
      budget,
    )
    // An eligibility loss or empty attempt still consumes one bounded user attempt.
    if (before === budget.remainingRows) budget.remainingRows--
    deleted += result.deleted
    hasMore ||= result.hasMore
  }
  return { deleted, hasMore }
}

export async function deleteOldReferralAttributionBatch(
  cutoffId: string,
  batchSize: number,
  lowerBoundId?: string,
): Promise<number> {
  const query = sql`/* deleteOldReferralAttributionBatch */
    DELETE FROM session_referral_attributions
    WHERE id IN (
      SELECT id FROM session_referral_attributions
      WHERE user_id IS NULL
        AND id < ${cutoffId}
  `
  if (lowerBoundId !== undefined) query.append(sql` AND id >= ${lowerBoundId}`)
  query.append(sql`
      ORDER BY id ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}

export async function deleteOrphanedOAuthAccountBatch(
  table: string,
  providerUserIdColumn: string,
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<number> {
  const validatedTable = assertWhitelistedSqlIdentifier(
    table,
    allowedOAuthCleanupIdentifiers,
    'OAuth cleanup table',
  )
  const validatedProviderUserIdColumn = assertWhitelistedSqlIdentifier(
    providerUserIdColumn,
    allowedOAuthCleanupIdentifiers,
    'OAuth cleanup providerUserIdColumn',
  )
  if (oauthProviderUserIdColumnByTable.get(validatedTable) !== validatedProviderUserIdColumn) {
    throw new Error(
      `Invalid OAuth cleanup identifier combination: ${validatedTable}.${validatedProviderUserIdColumn}`,
    )
  }

  const query = sql`/* deleteOrphanedOAuthAccountBatch */
    DELETE FROM `
    .append(validatedTable)
    .append(sql`
    WHERE `)
    .append(validatedProviderUserIdColumn)
    .append(sql` IN (
      SELECT `)
    .append(validatedProviderUserIdColumn)
    .append(sql` FROM `)
    .append(validatedTable).append(sql`
      WHERE user_id IS NULL
        AND created_at < ${cutoffDate}
  `)
  if (lowerBoundDate !== undefined) query.append(sql` AND created_at >= ${lowerBoundDate}`)
  const authorizationProviderUserIdColumn =
    oauthAuthorizationProviderUserIdColumnByAccountTable.get(validatedTable)
  if (authorizationProviderUserIdColumn) {
    query
      .append(sql` AND NOT EXISTS (
        SELECT 1
        FROM oauth_authorizations active_authorization
        WHERE active_authorization.`)
      .append(authorizationProviderUserIdColumn)
      .append(sql` = `)
      .append(validatedTable)
      .append(sql`.`)
      .append(validatedProviderUserIdColumn).append(sql`
          AND active_authorization.expires_at > CURRENT_TIMESTAMP
      )`)
  }
  query.append(sql`
      ORDER BY created_at ASC, `)
  query.append(validatedProviderUserIdColumn)
  query.append(sql` ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )`)

  const { rowCount } = await write(query)
  return rowCount ?? 0
}
