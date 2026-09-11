import { beginTransaction, write } from '@data-stores/psql'

const FRIEND_MUTATION_BATCH_SIZE = 1000

export async function persistFacebookFriendPage(
  facebookUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistFacebookFriendBatch(facebookUserId, userId, batch)
    if (!persisted) return false
  }
  return true
}

export async function finalizeFacebookFriendSync(
  facebookUserId: string,
  userId: string,
  syncStartTime: string,
): Promise<void> {
  while (true) {
    // Candidate discovery does not hold the deletion fence; only the bounded mutation page does.
    // oxlint-disable-next-line no-await-in-loop -- each page commits before selecting its successor.
    const staleFriendIds = await getStaleFacebookFriendIds(facebookUserId, syncStartTime)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markFacebookFriendSyncComplete(facebookUserId, userId)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteFacebookFriendBatch(
      facebookUserId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return
  }
}

async function persistFacebookFriendBatch(
  facebookUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookUserId, userId)
  if (!owner) return false

  await transaction(
    `/* persistFacebookFriendBatch */ INSERT INTO facebook_friends (facebook_user_id, facebook_friend_id)
     SELECT $1, friend_id FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (facebook_user_id, facebook_friend_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [facebookUserId, friendIds],
  )
  await transaction.commit()
  return true
}

async function getStaleFacebookFriendIds(
  facebookUserId: string,
  syncStartTime: string,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleFacebookFriendIds */ SELECT facebook_friend_id
     FROM facebook_friends
     WHERE facebook_user_id = $1 AND updated_at <= $2::timestamptz
     ORDER BY facebook_friend_id
     LIMIT $3`,
    [facebookUserId, syncStartTime, FRIEND_MUTATION_BATCH_SIZE],
  )
  return rows.map(row => (row as { facebook_friend_id: string }).facebook_friend_id)
}

async function deleteFacebookFriendBatch(
  facebookUserId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookUserId, userId)
  if (!owner) return false

  await transaction(
    `/* deleteFacebookFriendBatch */ DELETE FROM facebook_friends
     WHERE facebook_user_id = $1
       AND facebook_friend_id = ANY($2::text[])
       AND updated_at <= $3::timestamptz`,
    [facebookUserId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markFacebookFriendSyncComplete(
  facebookUserId: string,
  userId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookUserId, userId)
  if (!owner) return false

  await transaction(
    `/* markFacebookFriendSyncComplete */ UPDATE facebook_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE facebook_user_id = $1 AND user_id = $2`,
    [facebookUserId, userId],
  )
  await transaction.commit()
  return true
}

async function lockActiveFacebookSyncOwner(
  query: Parameters<typeof facebookSyncOwnerExists>[0],
  userId: string,
): Promise<void> {
  await query(
    `/* lockActiveFacebookSyncOwner */ SELECT fn_lock_active_user_for_mutation($1::uuid)`,
    [userId],
  )
}

async function facebookSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  facebookUserId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* facebookSyncOwnerExists */ SELECT 1 FROM facebook_accounts
     WHERE facebook_user_id = $1 AND user_id = $2 FOR UPDATE`,
    [facebookUserId, userId],
  )
  return rows.length > 0
}
