import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { beginTransaction, read, write } from '@data-stores/psql'
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
  lastObservedAt: Date | string,
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

/** An unlink transaction starts before a newer observation, then waits behind its source row. */
export async function observeGithubFriendBeforeQueuedUnlink(
  accountId: string,
  friendId: string,
): Promise<{ transactionStartedBeforeObservation: boolean; invalidatedAfterObservation: boolean }> {
  await using observer = await beginTransaction()
  await observer(
    `/* observeGithubFriendBeforeQueuedUnlink:share */
     SELECT id FROM github_accounts WHERE id = $1::uuid FOR SHARE`,
    [accountId],
  )
  await using unlink = await beginTransaction()
  const { rows: started } = await unlink<{ started_at: string }>(
    `/* observeGithubFriendBeforeQueuedUnlink:start */
     SELECT transaction_timestamp()::text AS started_at`,
  )
  const queuedUnlink = unlink(
    `/* observeGithubFriendBeforeQueuedUnlink:unlink */
     UPDATE github_accounts SET user_id = NULL WHERE id = $1::uuid`,
    [accountId],
  )
  const { rows: observed } = await observer<{ observed_at: string }>(
    `/* observeGithubFriendBeforeQueuedUnlink:observe */
     INSERT INTO github_friends (github_account_id, github_friend_id, last_observed_at)
     VALUES ($1::uuid, $2::text, clock_timestamp())
     RETURNING last_observed_at::text AS observed_at`,
    [accountId, friendId],
  )
  await observer.commit()
  await queuedUnlink
  const { rows } = await unlink<{
    transaction_started_before_observation: boolean
    invalidated_after_observation: boolean
  }>(
    `/* observeGithubFriendBeforeQueuedUnlink:verify */
     SELECT $2::timestamptz < $3::timestamptz AS transaction_started_before_observation,
       account.friend_edges_invalidated_at > $3::timestamptz AS invalidated_after_observation
     FROM github_accounts account WHERE account.id = $1::uuid`,
    [accountId, started[0]!.started_at, observed[0]!.observed_at],
  )
  return {
    transactionStartedBeforeObservation: rows[0]!.transaction_started_before_observation,
    invalidatedAfterObservation: rows[0]!.invalidated_after_observation,
  }
}

export async function testGithubFriendExists(id: string): Promise<boolean> {
  const { rows } = await read(
    `/* testGithubFriendExists */ SELECT 1 FROM github_friends WHERE id = $1`,
    [id],
  )
  return rows.length > 0
}

export async function setTestGithubFriendInvalidation(
  accountId: string,
  invalidatedAt: string,
): Promise<void> {
  await write(
    `/* setTestGithubFriendInvalidation */ UPDATE github_accounts
     SET friend_edges_invalidated_at = $2::timestamptz,
       friend_edges_cleanup_completed_at = NULL
     WHERE id = $1::uuid`,
    [accountId, invalidatedAt],
  )
}

export async function testGithubFriendCleanupComplete(accountId: string): Promise<boolean> {
  const { rows } = await read<{ complete: boolean }>(
    `/* testGithubFriendCleanupComplete */
     SELECT friend_edges_cleanup_completed_at = friend_edges_invalidated_at AS complete
     FROM github_accounts WHERE id = $1::uuid`,
    [accountId],
  )
  return rows[0]?.complete ?? false
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
