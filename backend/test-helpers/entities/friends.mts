import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { beginTransaction, read, type OwnedTransaction, write } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import {
  getOAuthTokenPurpose,
  providerTableConfigs,
  type OAuthProvider,
} from './_oauth-config-support.mts'
import { getFriendsTableConfig, sourceAccountId } from './friends-config.mts'

export async function setTestOAuthAccountAccessToken(
  provider: OAuthProvider,
  providerUserId: string,
  accessToken: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET access_token_ciphertext = $1 WHERE ${config.providerUserIdColumn} = $2`,
    ),
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
    allowUnannotatedQuery(`UPDATE x_accounts
     SET access_token_ciphertext = $1, refresh_token_ciphertext = $2, access_token_expires_at = NOW() - INTERVAL '1 minute'
     WHERE x_user_id = $3`),
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
    allowUnannotatedQuery(
      `SELECT friends_synced_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
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
    allowUnannotatedQuery(
      `SELECT access_token_ciphertext FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
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
  const friendAccountColumn = provider === 'facebook' ? ', friend_facebook_account_id' : ''
  const friendAccountValue =
    provider === 'facebook'
      ? ', (SELECT id FROM facebook_accounts WHERE facebook_user_id = $2)'
      : ''
  await write(
    allowUnannotatedQuery(`INSERT INTO ${config.table} (${config.userIdColumn}, ${config.friendIdColumn}${friendAccountColumn})
     SELECT ${sourceAccountId(provider)}, $2${friendAccountValue}
     ON CONFLICT DO NOTHING`),
    [providerUserId, friendProviderUserId],
  )
}

export async function insertTestFriends(
  provider: OAuthProvider,
  providerUserId: string,
  friendProviderUserIds: string[],
): Promise<void> {
  const config = getFriendsTableConfig(provider)
  const friendAccountColumn = provider === 'facebook' ? ', friend_facebook_account_id' : ''
  const friendAccountValue =
    provider === 'facebook'
      ? ', (SELECT id FROM facebook_accounts WHERE facebook_user_id = friend_id)'
      : ''
  await write(
    allowUnannotatedQuery(`INSERT INTO ${config.table} (${config.userIdColumn}, ${config.friendIdColumn}${friendAccountColumn})
     SELECT ${sourceAccountId(provider)}, friend_id${friendAccountValue}
     FROM UNNEST($2::text[]) AS friend_id
     ON CONFLICT DO NOTHING`),
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
      `/* testFriends */ SELECT 1 FROM ${config.table}
       WHERE ${config.userIdColumn} = ${sourceAccountId(provider)} AND ${config.friendIdColumn} = $2
       FOR UPDATE`,
      [providerUserId, friendProviderUserId],
    )
    if (result.rows.length === 0) throw new Error('Friend row to lock does not exist')
  } catch (err) {
    await transaction.rollback()
    throw err
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
    allowUnannotatedQuery(
      `SELECT * FROM ${config.table} WHERE ${config.userIdColumn} = ${sourceAccountId(provider)} AND ${config.friendIdColumn} = $2`,
    ),
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
    allowUnannotatedQuery(
      `SELECT COUNT(*) AS count FROM ${config.table} WHERE ${config.userIdColumn} = ${sourceAccountId(provider)}`,
    ),
    [providerUserId],
  )
  return Number(rows[0]?.count ?? 0)
}
