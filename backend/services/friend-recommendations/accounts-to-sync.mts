import { assertNever } from '@modules/utils/assert-never'
import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { getFriendsDispatchLimits } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'

export type AccountToSync = { id: string; eligible: boolean }
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
): AsyncGenerator<AccountToSync, CursorRunResult<AccountToSync>, void> {
  const limits = options.limits ?? getFriendsDispatchLimits()
  const sweepStartedAt = options.sweepStartedAt ?? new Date().toISOString()
  const upperId =
    options.upperId !== undefined ? options.upperId : await getFriendAccountSweepUpperId(provider)
  if (upperId === null) {
    const result: CursorRunResult<AccountToSync> = { rowsRead: 0, hasMore: false }
    options.onComplete?.(result)
    return result
  }
  return yield* createAsyncGeneratorFromCursor<AccountToSync>(
    `/* streamAccountsToSync */ SELECT id,
       (created_at <= $3::timestamptz
        AND user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL
        ${provider === 'x' ? 'AND (access_token_expires_at IS NULL OR access_token_expires_at > $3::timestamptz OR refresh_token_ciphertext IS NOT NULL)' : ''}
        AND (friends_synced_at IS NULL OR friends_synced_at < $3::timestamptz - INTERVAL '24 hours')) AS eligible
     FROM ${provider}_accounts
     WHERE id <= $1::uuid AND id > $2::uuid
     ORDER BY id LIMIT $4`,
    [
      upperId,
      options.afterId ?? '00000000-0000-0000-0000-000000000000',
      sweepStartedAt,
      limits.maxRows,
    ],
    {
      batchSize: limits.batchSize,
      maxRows: limits.maxRows,
      onComplete: result => {
        // The inner SQL LIMIT caps physical rows, so an exact-full page needs an empty
        // continuation instead of the cursor helper's out-of-budget lookahead.
        result.hasMore = result.rowsRead === limits.maxRows
        options.onComplete?.(result)
      },
    },
  )
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
