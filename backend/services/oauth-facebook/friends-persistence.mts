import { getOauthFacebookWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'

export async function persistFacebookFriendPage(
  facebookAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  const FRIEND_MUTATION_BATCH_SIZE = getOauthFacebookWorkLimit('friend_mutation_batch_size')
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- each bounded chunk commits before the next.
    const persisted = await persistFacebookFriendBatch(
      facebookAccountId,
      userId,
      batch,
      syncStartTime,
    )
    if (!persisted) return false
  }
  return true
}

/**
 * Deletes stale edges for at most one run's batch cap. Returns the last deleted friend id (the
 * position the follow-up run resumes after) when it must continue, or null when cleanup is done.
 */
export async function finalizeFacebookFriendSync(
  facebookAccountId: string,
  userId: string,
  syncStartTime: string,
  after = '',
): Promise<string | null> {
  const batchSize = getOauthFacebookWorkLimit('friend_mutation_batch_size')
  const maxBatches = getOauthFacebookWorkLimit('max_finalize_batches_per_run')
  let lastFinalizedKey = after
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleFacebookFriendIds(
      facebookAccountId,
      syncStartTime,
      batchSize,
      lastFinalizedKey,
    )
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markFacebookFriendSyncComplete(facebookAccountId, userId, syncStartTime)
      return null
    }
    // oxlint-disable-next-line no-await-in-loop -- each page commits before the next.
    const deleted = await deleteFacebookFriendBatch(
      facebookAccountId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return null
    lastFinalizedKey = staleFriendIds.at(-1)!
  }
  return lastFinalizedKey
}

async function persistFacebookFriendBatch(
  facebookAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* persistFacebookFriendBatch */ INSERT INTO facebook_friends (facebook_account_id, facebook_friend_id, friend_facebook_account_id, last_observed_at)
     SELECT $1::uuid, friend_id,
       (SELECT CASE WHEN user_id IS NOT NULL THEN id END FROM facebook_accounts
        WHERE facebook_user_id = friend_id), $3::timestamptz
     FROM UNNEST($2::text[]) AS friend_id
     WHERE EXISTS (SELECT 1 FROM facebook_accounts owner JOIN users ON users.id = owner.user_id
       WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
         AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))
     ORDER BY $1, friend_id
     ON CONFLICT (facebook_account_id, facebook_friend_id) DO UPDATE SET
       friend_facebook_account_id = EXCLUDED.friend_facebook_account_id,
       last_observed_at = EXCLUDED.last_observed_at
     WHERE facebook_friends.last_observed_at <= EXCLUDED.last_observed_at`,
    [facebookAccountId, friendIds, syncStartTime, userId],
  )
  await transaction.commit()
  return true
}

async function getStaleFacebookFriendIds(
  facebookAccountId: string,
  syncStartTime: string,
  batchSize: number,
  after: string,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleFacebookFriendIds */ SELECT facebook_friend_id
     FROM facebook_friends
     WHERE facebook_account_id = $1 AND last_observed_at < $2::timestamptz AND facebook_friend_id > $4
     ORDER BY facebook_friend_id
     LIMIT $3`,
    [facebookAccountId, syncStartTime, batchSize, after],
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
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* deleteFacebookFriendBatch */ DELETE FROM facebook_friends
     WHERE facebook_account_id = $1
       AND facebook_friend_id = ANY($2::text[])
       AND last_observed_at < $3::timestamptz
       AND EXISTS (SELECT 1 FROM facebook_accounts owner JOIN users ON users.id = owner.user_id
         WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
           AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))`,
    [facebookAccountId, friendIds, syncStartTime, userId],
  )
  await transaction.commit()
  return true
}

async function markFacebookFriendSyncComplete(
  facebookAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const owner = await facebookSyncOwnerExists(transaction, facebookAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* markFacebookFriendSyncComplete */ UPDATE facebook_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)`,
    [facebookAccountId, userId, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function facebookSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  facebookAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* facebookSyncOwnerExists */ SELECT 1 FROM facebook_accounts
     WHERE id = $1 AND user_id = $2
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
`,
    [facebookAccountId, userId, syncStartTime],
  )
  return rows.length > 0
}
