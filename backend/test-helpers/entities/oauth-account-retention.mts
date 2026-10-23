import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import { providerTableConfigs, type OAuthProvider } from './_oauth-config-support.mts'

export async function setOAuthAccountRetentionTime(
  provider: OAuthProvider,
  providerUserId: string,
  unlinkedAt: Date,
): Promise<string | null> {
  const config = providerTableConfigs[provider]
  // Orphan fixtures use an old ID and unlink time so the indexed cleanup window is isolated.
  const accountId = config.accountIdColumn === 'id' ? uuidv7({ msecs: unlinkedAt.getTime() }) : null
  const column = accountId ? 'id' : 'created_at'
  const value = accountId ?? unlinkedAt
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET ${column} = $1, unlinked_at = $3 WHERE ${config.providerUserIdColumn} = $2`,
    ),
    [value, providerUserId, unlinkedAt],
  )
  return accountId
}

export async function getOAuthAccountCreatedAt(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Date | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read<{ created_at: Date }>(
    allowUnannotatedQuery(
      `SELECT created_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
  return rows[0]?.created_at ?? null
}

export async function getOAuthAccountUnlinkedAt(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Date | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read<{ unlinked_at: Date | null }>(
    allowUnannotatedQuery(
      `SELECT unlinked_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
  return rows[0]?.unlinked_at ?? null
}

export async function backdateOAuthAccountUnlinkedAt(
  provider: OAuthProvider,
  providerUserId: string,
  unlinkedAt: Date,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET unlinked_at = $1 WHERE ${config.providerUserIdColumn} = $2`,
    ),
    [unlinkedAt, providerUserId],
  )
}

export async function insertTestGithubFriend(
  accountId: string,
  friendId: string,
  lastObservedAt: Date,
  friendAccountId?: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* insertTestGithubFriend */ INSERT INTO github_friends
       (github_account_id, github_friend_id, friend_github_account_id, last_observed_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [accountId, friendId, friendAccountId ?? null, lastObservedAt],
  )
  return rows[0]!.id
}

export async function testGithubFriendExists(id: string): Promise<boolean> {
  const { rows } = await read(
    `/* testGithubFriendExists */ SELECT 1 FROM github_friends WHERE id = $1`,
    [id],
  )
  return rows.length > 0
}

export async function oauthAccountExistsByProviderUserId(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<boolean> {
  const config = providerTableConfigs[provider]
  const { rows } = await read(
    allowUnannotatedQuery(
      `SELECT ${config.providerUserIdColumn} FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
  return rows.length > 0
}
