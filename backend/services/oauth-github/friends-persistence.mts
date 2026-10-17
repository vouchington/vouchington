import { getOauthGithubWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'

export async function persistGithubFriendPage(
  githubAccountId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  const FRIEND_MUTATION_BATCH_SIZE = getOauthGithubWorkLimit('friend_mutation_batch_size')
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistGithubFriendBatch(githubAccountId, userId, batch)
    if (!persisted) return false
  }
  return true
}

export async function finalizeGithubFriendSync(
  githubAccountId: string,
  userId: string,
  syncStartTime: string,
  options?: { onStaleFriendPage?: (friendIds: string[]) => void },
): Promise<void> {
  const batchSize = getOauthGithubWorkLimit('friend_mutation_batch_size')
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleGithubFriendIds(githubAccountId, syncStartTime, batchSize)
    options?.onStaleFriendPage?.(staleFriendIds)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markGithubFriendSyncComplete(githubAccountId, userId)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteGithubFriendBatch(
      githubAccountId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return
  }
}

async function persistGithubFriendBatch(
  githubAccountId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId))) return false

  await transaction(
    `/* persistGithubFriendBatch */ INSERT INTO github_friends (github_account_id, github_friend_id, friend_github_account_id)
     SELECT $1::uuid, friend_id, (SELECT id FROM github_accounts WHERE github_user_id = friend_id)
     FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (github_account_id, github_friend_id) DO UPDATE SET
       friend_github_account_id = EXCLUDED.friend_github_account_id,
       last_observed_at = CURRENT_TIMESTAMP`,
    [githubAccountId, friendIds],
  )
  await transaction.commit()
  return true
}

async function getStaleGithubFriendIds(
  githubAccountId: string,
  syncStartTime: string,
  batchSize: number,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleGithubFriendIds */ SELECT github_friend_id
     FROM github_friends
     WHERE github_account_id = $1 AND last_observed_at <= $2::timestamptz
     ORDER BY github_friend_id
     LIMIT $3`,
    [githubAccountId, syncStartTime, batchSize],
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
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId))) return false

  await transaction(
    `/* deleteGithubFriendBatch */ DELETE FROM github_friends
     WHERE github_account_id = $1
       AND github_friend_id = ANY($2::text[])
       AND last_observed_at <= $3::timestamptz`,
    [githubAccountId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markGithubFriendSyncComplete(
  githubAccountId: string,
  userId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubAccountId, userId))) return false

  await transaction(
    `/* markGithubFriendSyncComplete */ UPDATE github_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [githubAccountId, userId],
  )
  await transaction.commit()
  return true
}

async function lockActiveGithubSyncOwner(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
): Promise<void> {
  await query(`/* lockActiveGithubSyncOwner */ SELECT fn_lock_active_user_for_mutation($1::uuid)`, [
    userId,
  ])
}

async function githubSyncOwnerExists(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  githubAccountId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* githubSyncOwnerExists */ SELECT 1 FROM github_accounts
     WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [githubAccountId, userId],
  )
  return rows.length > 0
}
