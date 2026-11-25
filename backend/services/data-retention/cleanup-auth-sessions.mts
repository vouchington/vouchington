import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import {
  deleteExpiredLoginTokens,
  deleteProtectedAuthSessionPage,
  type CleanupName,
  type Cursor,
} from './cleanup-auth-session-candidates.mts'

export type AuthSessionCleanupOptions = {
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
  borrowedQuery?: TransactionQuery
}

type Position = { at: string | null; id: string; userId?: string }
export type AuthSessionCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: Position | null
}

const RETENTION_DAYS: Record<CleanupName, number> = {
  email_address_login_tokens: 1,
  phone_number_login_tokens: 1,
  user_sessions: 30,
  web_push_subscriptions: 90,
}

export const cleanupEmailAddressLoginTokens = (options: AuthSessionCleanupOptions) =>
  cleanupAuthSessionRows('email_address_login_tokens', options)
export const cleanupPhoneNumberLoginTokens = (options: AuthSessionCleanupOptions) =>
  cleanupAuthSessionRows('phone_number_login_tokens', options)
export const cleanupExpiredUserSessions = (options: AuthSessionCleanupOptions) =>
  cleanupAuthSessionRows('user_sessions', options)
export const cleanupWebPushSubscriptionTombstones = (options: AuthSessionCleanupOptions) =>
  cleanupAuthSessionRows('web_push_subscriptions', options)

async function cleanupAuthSessionRows(
  name: CleanupName,
  options: AuthSessionCleanupOptions,
): Promise<AuthSessionCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, 500, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const cutoff = getRetentionCutoffDate(RETENTION_DAYS[name], options.now)
  let deleted = 0
  let hasMore = false
  let continuation: Position | null = null
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- checkpoint and deletion commit together before selecting the next keyset page
    const result = await cleanupPage(
      name,
      cutoff,
      batchSize,
      options.lowerBoundDate,
      options.borrowedQuery,
    )
    deleted += result.deleted
    hasMore = result.hasMore
    continuation = result.continuation
    if (!hasMore) break
  }
  return { deleted, hasMore, continuation }
}

async function cleanupPage(
  name: CleanupName,
  cutoff: Date,
  batchSize: number,
  lowerBoundDate?: Date,
  borrowedQuery?: TransactionQuery,
): Promise<AuthSessionCleanupResult> {
  if (borrowedQuery)
    return withTransactionOptions({ query: borrowedQuery }, query =>
      cleanupPageInTransaction(query, name, cutoff, batchSize, lowerBoundDate, true),
    )
  await using query = await beginTransaction()
  const result = await cleanupPageInTransaction(
    query,
    name,
    cutoff,
    batchSize,
    lowerBoundDate,
    lowerBoundDate === undefined,
  )
  await query.commit()
  return result
}

async function cleanupPageInTransaction(
  query: TransactionQuery,
  name: CleanupName,
  cutoff: Date,
  batchSize: number,
  lowerBoundDate: Date | undefined,
  trackCursor: boolean,
): Promise<AuthSessionCleanupResult> {
  // A bounded test window does not move the production cursor across unrelated rows.
  let cursor: Cursor | undefined
  if (trackCursor) {
    await query(
      `/* ensureAuthSessionRetentionCursor */
       INSERT INTO auth_session_retention_cleanup_cursors (cleanup_name)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [name],
    )
    cursor = (
      await query<Cursor>(
        `/* readAuthSessionRetentionCursor */
         SELECT cursor_at::text AS cursor_at, cursor_id, cursor_partition_key, sweep_cutoff_at
         FROM auth_session_retention_cleanup_cursors
         WHERE cleanup_name = $1`,
        [name],
      )
    ).rows[0]
  }
  const sweepCutoff = cursor?.sweep_cutoff_at ?? cutoff
  const { page, deleted } =
    name === 'email_address_login_tokens' || name === 'phone_number_login_tokens'
      ? await deleteExpiredLoginTokens(query, name, sweepCutoff, batchSize, cursor, lowerBoundDate)
      : await deleteProtectedAuthSessionPage(
          query,
          name,
          sweepCutoff,
          batchSize,
          cursor,
          lowerBoundDate,
        )
  const hasMore = page.length === batchSize
  const last = hasMore ? page.at(-1) : undefined
  let continuation: Position | null = null
  if (last) {
    if (name === 'web_push_subscriptions' && !last.user_id)
      throw new Error('Push subscription candidate lacks user_id')
    continuation = {
      at: last.position_at,
      id: last.id,
      ...(last.user_id ? { userId: last.user_id } : {}),
    }
  }
  if (trackCursor) {
    await query(
      `/* checkpointAuthSessionRetentionCursor */
       UPDATE auth_session_retention_cleanup_cursors
       SET cursor_at = $2, cursor_id = $3, cursor_partition_key = $4, sweep_cutoff_at = $5
       WHERE cleanup_name = $1`,
      [
        name,
        continuation?.at ?? null,
        continuation?.id ?? null,
        continuation?.userId ?? null,
        hasMore ? sweepCutoff : null,
      ],
    )
  }
  return { deleted, hasMore, continuation }
}
