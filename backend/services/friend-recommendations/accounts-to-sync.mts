import { assertNever } from '@modules/utils/assert-never'
import { read } from '@data-stores/psql'
import { getFriendsDispatchLimits } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'

export type AccountToSync = { id: string }
export type AccountSyncSweepOptions = {
  sweepStartedAt?: string
  afterId?: string
  upperId?: string | null
  limits?: ReturnType<typeof getFriendsDispatchLimits>
  onComplete?: (result: CursorRunResult<AccountToSync>) => void
}
export type FriendSyncProvider = 'facebook' | 'x' | 'github'

function providerUserIdColumn(provider: FriendSyncProvider): string {
  switch (provider) {
    case 'facebook':
      return 'facebook_user_id'
    case 'x':
      return 'x_user_id'
    case 'github':
      return 'github_user_id'
    default:
      return assertNever(provider, 'Unknown friend sync provider')
  }
}

export async function getFriendAccountSweepUpperId(
  provider: FriendSyncProvider,
): Promise<string | null> {
  const { rows } = await read<{ id: string }>(
    `/* getFriendAccountSweepUpperId */ SELECT id FROM ${provider}_accounts ORDER BY id DESC LIMIT 1`,
  )
  return rows[0]?.id ?? null
}

export async function getFriendSyncProviderUserId(
  provider: FriendSyncProvider,
  accountId: string,
): Promise<string | null> {
  const { rows } = await read<{ provider_user_id: string }>(
    `/* getFriendSyncProviderUserId */ SELECT account.${providerUserIdColumn(provider)} AS provider_user_id
     FROM ${provider}_accounts account
     JOIN users linked_user ON linked_user.id = account.user_id
     WHERE account.id = $1::uuid AND linked_user.deleted_at IS NULL`,
    [accountId],
  )
  return rows[0]?.provider_user_id ?? null
}

async function* streamAccounts(
  provider: FriendSyncProvider,
  options: AccountSyncSweepOptions,
): AsyncGenerator<AccountToSync, CursorRunResult<AccountToSync>> {
  const limits = options.limits ?? getFriendsDispatchLimits()
  if (
    !Number.isSafeInteger(limits.batchSize) ||
    limits.batchSize < 1 ||
    !Number.isSafeInteger(limits.maxRows) ||
    limits.maxRows < 1
  ) {
    throw new RangeError('Friend account scan limits must be positive integers')
  }
  const sweepStartedAt = options.sweepStartedAt ?? new Date().toISOString()
  const upperId =
    options.upperId !== undefined ? options.upperId : await getFriendAccountSweepUpperId(provider)
  const result: CursorRunResult<AccountToSync> = { rowsRead: 0, hasMore: upperId !== null }
  let afterId = options.afterId
  try {
    while (result.hasMore && result.rowsRead < limits.maxRows) {
      const remainingRows = limits.maxRows - result.rowsRead
      const pageSize = Math.min(limits.batchSize, remainingRows)
      const queryLimit = Math.min(pageSize + 1, remainingRows)
      const values: unknown[] = [upperId, sweepStartedAt, queryLimit]
      const cursorClause = afterId ? `AND id > $${values.push(afterId)}::uuid` : ''
      // The limit applies before eligibility. A sparse due predicate cannot make
      // this invocation read arbitrarily many account rows to fill one output page.
      // The retained ID cursor advances past scanned ineligible accounts too.
      /* oxlint-disable no-await-in-loop -- each indexed page advances the retained scan cursor. */
      // no-mistakes-disable-next-line query-reached-per-item: runtime maxRows includes lookahead reads and each indexed page advances the retained cursor.
      const { rows } = await read<{ id: string; is_due: boolean }>(
        `/* streamAccountsToSync */ SELECT id,
          (created_at <= $2::timestamptz
            AND user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL
            ${provider === 'x' ? 'AND (access_token_expires_at IS NULL OR access_token_expires_at > $2::timestamptz OR refresh_token_ciphertext IS NOT NULL)' : ''}
            AND (friends_synced_at IS NULL OR friends_synced_at < $2::timestamptz - INTERVAL '24 hours')) AS is_due
         FROM ${provider}_accounts
         WHERE id <= $1::uuid ${cursorClause}
         ORDER BY id LIMIT $3`,
        values,
      )
      /* oxlint-enable no-await-in-loop */
      result.rowsRead += rows.length
      const scanned = rows.slice(0, pageSize)
      for (const row of scanned) {
        result.lastRow = { id: row.id }
        if (row.is_due) yield { id: row.id }
      }
      // A full final budget page has no room for lookahead; another invocation
      // can verify EOF without exceeding this run's physical read limit.
      result.hasMore =
        rows.length > pageSize || (queryLimit === remainingRows && rows.length === queryLimit)
      if (!result.hasMore || !result.lastRow) break
      afterId = result.lastRow.id
    }
    return result
  } finally {
    options.onComplete?.(result)
  }
}

export function streamFacebookAccountsToSync(options: AccountSyncSweepOptions = {}) {
  return streamAccounts('facebook', options)
}
export function streamXAccountsToSync(options: AccountSyncSweepOptions = {}) {
  return streamAccounts('x', options)
}
export function streamGithubAccountsToSync(options: AccountSyncSweepOptions = {}) {
  return streamAccounts('github', options)
}
