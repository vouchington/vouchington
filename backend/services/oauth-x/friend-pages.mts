import { beginTransaction, write } from '@data-stores/psql'

const FRIEND_MUTATION_BATCH_SIZE = 1000

export async function persistXFriendPage(
  xUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistXFriendBatch(xUserId, userId, batch)
    if (!persisted) return false
  }
  return true
}

export async function finalizeXFriendSync(
  xUserId: string,
  userId: string,
  syncStartTime: string,
): Promise<void> {
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleXFriendIds(xUserId, syncStartTime)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markXFriendSyncComplete(xUserId, userId)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteXFriendBatch(xUserId, userId, syncStartTime, staleFriendIds)
    if (!deleted) return
  }
}

async function persistXFriendBatch(
  xUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveXSyncOwner(transaction, userId)
  if (!(await xSyncOwnerExists(transaction, xUserId, userId))) return false

  await transaction(
    `/* persistXFriendBatch */ INSERT INTO x_friends (x_user_id, x_friend_id)
     SELECT $1, friend_id FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (x_user_id, x_friend_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [xUserId, friendIds],
  )
  await transaction.commit()
  return true
}

async function getStaleXFriendIds(xUserId: string, syncStartTime: string): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleXFriendIds */ SELECT x_friend_id
     FROM x_friends
     WHERE x_user_id = $1 AND updated_at <= $2::timestamptz
     ORDER BY x_friend_id
     LIMIT $3`,
    [xUserId, syncStartTime, FRIEND_MUTATION_BATCH_SIZE],
  )
  return rows.map(row => (row as { x_friend_id: string }).x_friend_id)
}

async function deleteXFriendBatch(
  xUserId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveXSyncOwner(transaction, userId)
  if (!(await xSyncOwnerExists(transaction, xUserId, userId))) return false

  await transaction(
    `/* deleteXFriendBatch */ DELETE FROM x_friends
     WHERE x_user_id = $1
       AND x_friend_id = ANY($2::text[])
       AND updated_at <= $3::timestamptz`,
    [xUserId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markXFriendSyncComplete(xUserId: string, userId: string): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveXSyncOwner(transaction, userId)
  if (!(await xSyncOwnerExists(transaction, xUserId, userId))) return false

  await transaction(
    `/* markXFriendSyncComplete */ UPDATE x_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE x_user_id = $1 AND user_id = $2`,
    [xUserId, userId],
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

async function xSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  xUserId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* xSyncOwnerExists */ SELECT 1 FROM x_accounts
     WHERE x_user_id = $1 AND user_id = $2 FOR UPDATE`,
    [xUserId, userId],
  )
  return rows.length > 0
}
