import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { getFriendsDispatchLimits } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'

export type AccountToSync = { provider_user_id: string }
export type AccountSyncSweepOptions = {
  sweepStartedAt?: string
  afterId?: string
  upperId?: string | null
  limits?: ReturnType<typeof getFriendsDispatchLimits>
  onComplete?: (result: CursorRunResult<AccountToSync>) => void
}
const PROVIDERS = {
  facebook: 'facebook_user_id',
  x: 'x_user_id',
  github: 'github_user_id',
} as const
export type FriendSyncProvider = keyof typeof PROVIDERS

export async function getFriendAccountSweepUpperId(
  provider: FriendSyncProvider,
): Promise<string | null> {
  const { rows } = await read<{ id: string }>(
    `/* getFriendAccountSweepUpperId */ SELECT ${PROVIDERS[provider]} AS id FROM ${provider}_accounts ORDER BY ${PROVIDERS[provider]} DESC LIMIT 1`,
  )
  return rows[0]?.id ?? null
}

async function* streamAccounts(provider: FriendSyncProvider, options: AccountSyncSweepOptions) {
  const limits = options.limits ?? getFriendsDispatchLimits()
  const sweepStartedAt = options.sweepStartedAt ?? new Date().toISOString()
  const upperId =
    options.upperId !== undefined ? options.upperId : await getFriendAccountSweepUpperId(provider)
  const id = PROVIDERS[provider]
  return yield* createAsyncGeneratorFromCursor<AccountToSync>(
    `/* streamAccountsToSync */ SELECT ${id} AS provider_user_id
     FROM ${provider}_accounts
     WHERE ${id} <= $1 AND ($2::text IS NULL OR ${id} > $2)
       AND created_at <= $3::timestamptz
       AND user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL
       ${provider === 'x' ? 'AND (access_token_expires_at IS NULL OR access_token_expires_at > $3::timestamptz OR refresh_token_ciphertext IS NOT NULL)' : ''}
       AND (friends_synced_at IS NULL OR friends_synced_at < $3::timestamptz - INTERVAL '24 hours')
     ORDER BY ${id}`,
    [upperId, options.afterId ?? null, sweepStartedAt],
    { batchSize: limits.batchSize, maxRows: limits.maxRows, onComplete: options.onComplete },
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
