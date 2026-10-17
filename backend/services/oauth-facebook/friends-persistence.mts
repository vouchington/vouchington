import { getOauthFacebookWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'

export async function persistFacebookFriendPage(
  facebookAccountId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  const FRIEND_MUTATION_BATCH_SIZE = getOauthFacebookWorkLimit('friend_mutation_batch_size')
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistFacebookFriendBatch(facebookAccountId, userId, batch)
    if (!persisted) return false
  }
  return true
}

export async function finalizeFacebookFriendSync(
  facebookAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<void> {
  const batchSize = getOauthFacebookWorkLimit('friend_mutation_batch_size')
  while (true) {
    // Candidate discovery does not hold the deletion fence; only the bounded mutation page does.
    // oxlint-disable-next-line no-await-in-loop -- each page commits before selecting its successor.
    const staleFriendIds = await getStaleFacebookFriendIds(
      facebookAccountId,
      syncStartTime,
      batchSize,
    )
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markFacebookFriendSyncComplete(facebookAccountId, userId)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteFacebookFriendBatch(
      facebookAccountId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return
  }
}

async function persistFacebookFriendBatch(
  facebookAccountId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId)
  if (!owner) return false

  await transaction(
    `/* persistFacebookFriendBatch */ INSERT INTO facebook_friends (facebook_account_id, facebook_friend_id, friend_facebook_account_id)
     SELECT $1, friend_id,
       (SELECT id FROM facebook_accounts WHERE facebook_user_id = friend_id)
     FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (facebook_account_id, facebook_friend_id) DO UPDATE SET
       friend_facebook_account_id = EXCLUDED.friend_facebook_account_id,
       last_observed_at = CURRENT_TIMESTAMP`,
    [facebookAccountId, friendIds],
  )
  await transaction.commit()
  return true
}

async function getStaleFacebookFriendIds(
  facebookAccountId: string,
  syncStartTime: string,
  batchSize: number,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleFacebookFriendIds */ SELECT facebook_friend_id
     FROM facebook_friends
     WHERE facebook_account_id = $1 AND last_observed_at <= $2::timestamptz
     ORDER BY facebook_friend_id
     LIMIT $3`,
    [facebookAccountId, syncStartTime, batchSize],
  )
  return rows.map(row => (row as { facebook_friend_id: string }).facebook_friend_id)
}

async function deleteFacebookFriendBatch(
  facebookAccountId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId)
  if (!owner) return false

  await transaction(
    `/* deleteFacebookFriendBatch */ DELETE FROM facebook_friends
     WHERE facebook_account_id = $1
       AND facebook_friend_id = ANY($2::text[])
       AND last_observed_at <= $3::timestamptz`,
    [facebookAccountId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markFacebookFriendSyncComplete(
  facebookAccountId: string,
  userId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveFacebookSyncOwner(transaction, userId)
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId)
  if (!owner) return false

  await transaction(
    `/* markFacebookFriendSyncComplete */ UPDATE facebook_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [facebookAccountId, userId],
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
  facebookAccountId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* facebookSyncOwnerExists */ SELECT 1 FROM facebook_accounts
     WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [facebookAccountId, userId],
  )
  return rows.length > 0
}
