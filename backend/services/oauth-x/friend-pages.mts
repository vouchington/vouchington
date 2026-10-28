import { getOauthXWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'

export async function persistXFriendPage(
  xAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  const FRIEND_MUTATION_BATCH_SIZE = getOauthXWorkLimit('friend_mutation_batch_size')
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistXFriendBatch(xAccountId, userId, batch, syncStartTime)
    if (!persisted) return false
  }
  return true
}

export async function finalizeXFriendSync(
  xAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<void> {
  const batchSize = getOauthXWorkLimit('friend_mutation_batch_size')
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleXFriendIds(xAccountId, syncStartTime, batchSize)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markXFriendSyncComplete(xAccountId, userId, syncStartTime)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteXFriendBatch(xAccountId, userId, syncStartTime, staleFriendIds)
    if (!deleted) return
  }
}

async function persistXFriendBatch(
  xAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockXFriendImport(transaction, userId, friendIds)
  if (!(await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime))) return false

  // Lock an existing unlinked target too, so reconnect cannot clear resolution work before this insert.
  await transaction(
    `/* persistXFriendBatch */ INSERT INTO x_friends (x_account_id, x_friend_id, friend_x_account_id, last_observed_at)
     SELECT $1::uuid, friend_id,
       (SELECT CASE WHEN user_id IS NOT NULL THEN id END FROM x_accounts
        WHERE x_user_id = friend_id FOR SHARE), $3::timestamptz
     FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (x_account_id, x_friend_id) DO UPDATE SET
       friend_x_account_id = EXCLUDED.friend_x_account_id,
       last_observed_at = EXCLUDED.last_observed_at
     WHERE x_friends.last_observed_at <= EXCLUDED.last_observed_at`,
    [xAccountId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function getStaleXFriendIds(
  xAccountId: string,
  syncStartTime: string,
  batchSize: number,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleXFriendIds */ SELECT x_friend_id
     FROM x_friends
     WHERE x_account_id = $1 AND last_observed_at < $2::timestamptz
     ORDER BY x_friend_id
     LIMIT $3`,
    [xAccountId, syncStartTime, batchSize],
  )
  return rows.map(row => (row as { x_friend_id: string }).x_friend_id)
}

async function deleteXFriendBatch(
  xAccountId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveXSyncOwner(transaction, userId)
  if (!(await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime))) return false

  await transaction(
    `/* deleteXFriendBatch */ DELETE FROM x_friends
     WHERE x_account_id = $1
       AND x_friend_id = ANY($2::text[])
       AND last_observed_at < $3::timestamptz`,
    [xAccountId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markXFriendSyncComplete(
  xAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveXSyncOwner(transaction, userId)
  if (!(await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime))) return false

  await transaction(
    `/* markXFriendSyncComplete */ UPDATE x_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [xAccountId, userId],
  )
  await transaction.commit()
  return true
}

async function lockActiveXSyncOwner(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
): Promise<void> {
  await query(`/* lockActiveXSyncOwner */ SELECT fn_lock_active_user_for_mutation($1::uuid)`, [
    userId,
  ])
}

async function lockXFriendImport(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
  friendIds: string[],
): Promise<void> {
  await lockActiveXSyncOwner(query, userId)
  await query(
    `/* lockXFriendTargets */ SELECT fn_lock_oauth_friend_targets('x', $1::text[], FALSE)`,
    [friendIds],
  )
}

async function xSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  xAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* xSyncOwnerExists */ SELECT 1 FROM x_accounts
     WHERE id = $1 AND user_id = $2
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
     FOR SHARE`,
    [xAccountId, userId, syncStartTime],
  )
  return rows.length > 0
}
