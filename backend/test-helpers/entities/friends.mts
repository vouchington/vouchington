import { beginTransaction, read, type OwnedTransaction, write } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import {
  getOAuthTokenPurpose,
  providerTableConfigs,
  type OAuthProvider,
} from './_oauth-config-support.mts'

type FriendsTableConfig = {
  table: string
  userIdColumn: string
  friendIdColumn: string
}

const FRIENDS_TABLE_CONFIGS: Partial<Record<OAuthProvider, FriendsTableConfig>> = {
  facebook: {
    table: 'facebook_friends',
    userIdColumn: 'facebook_user_id',
    friendIdColumn: 'facebook_friend_id',
  },
  x: {
    table: 'x_friends',
    userIdColumn: 'x_user_id',
    friendIdColumn: 'x_friend_id',
  },
  github: {
    table: 'github_friends',
    userIdColumn: 'github_user_id',
    friendIdColumn: 'github_friend_id',
  },
}

function getFriendsTableConfig(provider: OAuthProvider): FriendsTableConfig {
  const config = FRIENDS_TABLE_CONFIGS[provider]
  if (!config) throw new Error(`No friends table config for provider: ${provider}`)
  return config
}

export async function setTestOAuthAccountAccessToken(
  provider: OAuthProvider,
  providerUserId: string,
  accessToken: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(
    `UPDATE ${config.table} SET access_token_ciphertext = $1 WHERE ${config.providerUserIdColumn} = $2`,
    [
      encryptSecret(accessToken, getOAuthTokenPurpose(provider, providerUserId, 'access_token')),
      providerUserId,
    ],
  )
}

export async function setTestXAccountExpiredToken(
  xUserId: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await write(
    `UPDATE x_accounts
     SET access_token_ciphertext = $1, refresh_token_ciphertext = $2, access_token_expires_at = NOW() - INTERVAL '1 minute'
     WHERE x_user_id = $3`,
    [
      encryptSecret(accessToken, getOAuthTokenPurpose('x', xUserId, 'access_token')),
      encryptSecret(refreshToken, getOAuthTokenPurpose('x', xUserId, 'refresh_token')),
      xUserId,
    ],
  )
}

export async function getTestOAuthAccountFriendsSyncedAt(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Date | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read(
    `SELECT friends_synced_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  return (rows[0]?.friends_synced_at as Date | undefined) ?? null
}

export async function getTestOAuthAccountAccessToken(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<string | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read(
    `SELECT access_token_ciphertext FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  const ciphertext = rows[0]?.access_token_ciphertext as string | undefined
  return ciphertext
    ? decryptSecret(ciphertext, getOAuthTokenPurpose(provider, providerUserId, 'access_token'))
    : null
}

export async function insertTestFriend(
  provider: OAuthProvider,
  providerUserId: string,
  friendProviderUserId: string,
): Promise<void> {
  const config = getFriendsTableConfig(provider)
  await write(
    `INSERT INTO ${config.table} (${config.userIdColumn}, ${config.friendIdColumn})
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [providerUserId, friendProviderUserId],
  )
}

export async function insertTestFriends(
  provider: OAuthProvider,
  providerUserId: string,
  friendProviderUserIds: string[],
): Promise<void> {
  const config = getFriendsTableConfig(provider)
  await write(
    `INSERT INTO ${config.table} (${config.userIdColumn}, ${config.friendIdColumn})
     SELECT $1, friend_id FROM UNNEST($2::text[]) AS friend_id
     ON CONFLICT DO NOTHING`,
    [providerUserId, friendProviderUserIds],
  )
}

export type TestFriendRowLock = {
  release(): Promise<void>
}

export async function acquireTestFriendRowLock(
  provider: OAuthProvider,
  providerUserId: string,
  friendProviderUserId: string,
): Promise<TestFriendRowLock> {
  const config = getFriendsTableConfig(provider)
  const transaction = await beginTransaction()
  try {
    const result = await transaction(
      `SELECT 1 FROM ${config.table}
       WHERE ${config.userIdColumn} = $1 AND ${config.friendIdColumn} = $2
       FOR UPDATE`,
      [providerUserId, friendProviderUserId],
    )
    if (result.rows.length === 0) throw new Error('Friend row to lock does not exist')
  } catch (error) {
    await transaction.rollback()
    throw error
  }
  return createTestFriendRowLock(transaction)
}

function createTestFriendRowLock(transaction: OwnedTransaction): TestFriendRowLock {
  let released = false
  return {
    async release() {
      if (released) return
      released = true
      await transaction.commit()
    },
  }
}

export async function getTestFriend(
  provider: OAuthProvider,
  providerUserId: string,
  friendProviderUserId: string,
): Promise<unknown[]> {
  const config = getFriendsTableConfig(provider)
  const { rows } = await read(
    `SELECT * FROM ${config.table} WHERE ${config.userIdColumn} = $1 AND ${config.friendIdColumn} = $2`,
    [providerUserId, friendProviderUserId],
  )
  return rows
}

export async function countTestFriends(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<number> {
  const config = getFriendsTableConfig(provider)
  const { rows } = await read(
    `SELECT COUNT(*) AS count FROM ${config.table} WHERE ${config.userIdColumn} = $1`,
    [providerUserId],
  )
  return Number(rows[0]?.count ?? 0)
}
