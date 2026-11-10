import { getOauthGithubWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'

export async function persistGithubFriendPage(
  githubAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  const FRIEND_MUTATION_BATCH_SIZE = getOauthGithubWorkLimit('friend_mutation_batch_size')
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- each bounded chunk commits before the next.
    const persisted = await persistGithubFriendBatch(githubAccountId, userId, batch, syncStartTime)
    if (!persisted) return false
  }
  return true
}

/**
 * Deletes stale edges for at most one run's batch cap. Returns the last deleted friend id (the
 * position the follow-up run resumes after) when it must continue, or null when cleanup is done.
 */
export async function finalizeGithubFriendSync(
  githubAccountId: string,
  userId: string,
  syncStartTime: string,
  options?: { after?: string; onStaleFriendPage?: (friendIds: string[]) => void },
): Promise<string | null> {
  const batchSize = getOauthGithubWorkLimit('friend_mutation_batch_size')
  const maxBatches = getOauthGithubWorkLimit('max_finalize_batches_per_run')
  let lastFinalizedKey = options?.after ?? ''
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleGithubFriendIds(
      githubAccountId,
      syncStartTime,
      batchSize,
      lastFinalizedKey,
    )
    options?.onStaleFriendPage?.(staleFriendIds)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markGithubFriendSyncComplete(githubAccountId, userId, syncStartTime)
      return null
    }
    // oxlint-disable-next-line no-await-in-loop -- each page commits before the next.
    const deleted = await deleteGithubFriendBatch(
      githubAccountId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return null
    lastFinalizedKey = staleFriendIds.at(-1)!
  }
  return lastFinalizedKey
}

async function persistGithubFriendBatch(
  githubAccountId: string,
  userId: string,
  friendIds: string[],
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId, syncStartTime)))
    return false

  await transaction(
    `/* persistGithubFriendBatch */ INSERT INTO github_friends (github_account_id, github_friend_id, friend_github_account_id, last_observed_at)
     SELECT $1::uuid, friend_id,
       (SELECT CASE WHEN user_id IS NOT NULL THEN id END FROM github_accounts
        WHERE github_user_id = friend_id), $3::timestamptz
     FROM UNNEST($2::text[]) AS friend_id
     WHERE EXISTS (SELECT 1 FROM github_accounts owner JOIN users ON users.id = owner.user_id
       WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
         AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))
     ORDER BY $1, friend_id
     ON CONFLICT (github_account_id, github_friend_id) DO UPDATE SET
       friend_github_account_id = EXCLUDED.friend_github_account_id,
       last_observed_at = EXCLUDED.last_observed_at
     WHERE github_friends.last_observed_at <= EXCLUDED.last_observed_at`,
    [githubAccountId, friendIds, syncStartTime, userId],
  )
  await transaction.commit()
  return true
}

async function getStaleGithubFriendIds(
  githubAccountId: string,
  syncStartTime: string,
  batchSize: number,
  after: string,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleGithubFriendIds */ SELECT github_friend_id
     FROM github_friends
     WHERE github_account_id = $1 AND last_observed_at < $2::timestamptz AND github_friend_id > $4
     ORDER BY github_friend_id
     LIMIT $3`,
    [githubAccountId, syncStartTime, batchSize, after],
  )
  return rows.map(row => (row as { github_friend_id: string }).github_friend_id)
}

async function deleteGithubFriendBatch(
  githubAccountId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId, syncStartTime)))
    return false

  await transaction(
    `/* deleteGithubFriendBatch */ DELETE FROM github_friends
     WHERE github_account_id = $1
       AND github_friend_id = ANY($2::text[])
       AND last_observed_at < $3::timestamptz
       AND EXISTS (SELECT 1 FROM github_accounts owner JOIN users ON users.id = owner.user_id
         WHERE owner.id = $1::uuid AND owner.user_id = $4::uuid AND users.deleted_at IS NULL
           AND (owner.friend_edges_invalidated_at IS NULL OR owner.friend_edges_invalidated_at < $3::timestamptz))`,
    [githubAccountId, friendIds, syncStartTime, userId],
  )
  await transaction.commit()
  return true
}

async function markGithubFriendSyncComplete(
  githubAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId, syncStartTime)))
    return false

  await transaction(
    `/* markGithubFriendSyncComplete */ UPDATE github_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)`,
    [githubAccountId, userId, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function githubSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  githubAccountId: string,
  userId: string,
  syncStartTime: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* githubSyncOwnerExists */ SELECT 1 FROM github_accounts
     WHERE id = $1 AND user_id = $2
       AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND deleted_at IS NULL)
       AND (friend_edges_invalidated_at IS NULL OR friend_edges_invalidated_at < $3::timestamptz)
`,
    [githubAccountId, userId, syncStartTime],
  )
  return rows.length > 0
}
