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
    // oxlint-disable-next-line no-await-in-loop -- each bounded chunk commits before the next.
    const persisted = await persistXFriendBatch(xAccountId, userId, batch, syncStartTime)
    if (!persisted) return false
  }
  return true
}

/**
 * Deletes stale edges for at most one run's batch cap. Returns the last deleted friend id (the
 * position the follow-up run resumes after) when it must continue, or null when cleanup is done.
 */
export async function finalizeXFriendSync(
  xAccountId: string,
  userId: string,
  syncStartTime: string,
  after = '',
): Promise<string | null> {
  const batchSize = getOauthXWorkLimit('friend_mutation_batch_size')
  const maxBatches = getOauthXWorkLimit('max_finalize_batches_per_run')
  let lastFinalizedKey = after
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleXFriendIds(
      xAccountId,
      syncStartTime,
      batchSize,
      lastFinalizedKey,
    )
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markXFriendSyncComplete(xAccountId, userId, syncStartTime)
      return null
    }
    // oxlint-disable-next-line no-await-in-loop -- each page commits before the next.
    const deleted = await deleteXFriendBatch(xAccountId, userId, syncStartTime, staleFriendIds)
    if (!deleted) return null
    lastFinalizedKey = staleFriendIds.at(-1)!
  }
  return lastFinalizedKey
}

async function persistXFriendBatch(
  xAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const owner = await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* persistXFriendBatch */ INSERT INTO x_friends (x_account_id, x_friend_id, friend_x_account_id, last_observed_at)
     SELECT $1::uuid, friend_id,
       (SELECT CASE WHEN user_id IS NOT NULL THEN id END FROM x_accounts
        WHERE x_user_id = friend_id), $3::timestamptz
     FROM UNNEST($2::text[]) AS friend_id
     WHERE EXISTS (SELECT 1 FROM x_accounts owner JOIN users ON users.id = owner.user_id
       WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
         AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))
     ORDER BY $1, friend_id
     ON CONFLICT (x_account_id, x_friend_id) DO UPDATE SET
       friend_x_account_id = EXCLUDED.friend_x_account_id,
       last_observed_at = EXCLUDED.last_observed_at
     WHERE x_friends.last_observed_at <= EXCLUDED.last_observed_at`,
    [xAccountId, friendIds, syncStartTime, userId],
  )
  await transaction.commit()
  return true
}

async function getStaleXFriendIds(
  xAccountId: string,
  syncStartTime: string,
  batchSize: number,
  after: string,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleXFriendIds */ SELECT x_friend_id
     FROM x_friends
     WHERE x_account_id = $1 AND last_observed_at < $2::timestamptz AND x_friend_id > $4
     ORDER BY x_friend_id
     LIMIT $3`,
    [xAccountId, syncStartTime, batchSize, after],
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
  const owner = await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* deleteXFriendBatch */ DELETE FROM x_friends
     WHERE x_account_id = $1
       AND x_friend_id = ANY($2::text[])
       AND last_observed_at < $3::timestamptz
       AND EXISTS (SELECT 1 FROM x_accounts owner JOIN users ON users.id = owner.user_id
         WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
           AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))`,
    [xAccountId, friendIds, syncStartTime, userId],
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
  const owner = await xSyncOwnerExists(transaction, xAccountId, userId, syncStartTime)
  if (!owner) return false

  await transaction(
    `/* markXFriendSyncComplete */ UPDATE x_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)`,
    [xAccountId, userId, syncStartTime],
  )
  await transaction.commit()
  return true
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
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
`,
    [xAccountId, userId, syncStartTime],
  )
  return rows.length > 0
}
