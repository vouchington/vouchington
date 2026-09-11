import { beginTransaction, write } from '@data-stores/psql'

const FRIEND_MUTATION_BATCH_SIZE = 1000

export async function persistGithubFriendPage(
  githubUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  const sortedFriendIds = [...new Set(friendIds)].toSorted()
  for (let offset = 0; offset < sortedFriendIds.length; offset += FRIEND_MUTATION_BATCH_SIZE) {
    const batch = sortedFriendIds.slice(offset, offset + FRIEND_MUTATION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every bounded chunk commits under a separately reacquired deletion fence.
    const persisted = await persistGithubFriendBatch(githubUserId, userId, batch)
    if (!persisted) return false
  }
  return true
}

export async function finalizeGithubFriendSync(
  githubUserId: string,
  userId: string,
  syncStartTime: string,
): Promise<void> {
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded candidate page follows the previous commit.
    const staleFriendIds = await getStaleGithubFriendIds(githubUserId, syncStartTime)
    if (staleFriendIds.length === 0) {
      // oxlint-disable-next-line no-await-in-loop -- completion follows the final bounded candidate read.
      await markGithubFriendSyncComplete(githubUserId, userId)
      return
    }
    // oxlint-disable-next-line no-await-in-loop -- each page reacquires the deletion fence.
    const deleted = await deleteGithubFriendBatch(
      githubUserId,
      userId,
      syncStartTime,
      staleFriendIds,
    )
    if (!deleted) return
  }
}

async function persistGithubFriendBatch(
  githubUserId: string,
  userId: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubUserId, userId))) return false

  await transaction(
    `/* persistGithubFriendBatch */ INSERT INTO github_friends (github_user_id, github_friend_id)
     SELECT $1, friend_id FROM UNNEST($2::text[]) AS friend_id
     ORDER BY $1, friend_id
     ON CONFLICT (github_user_id, github_friend_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [githubUserId, friendIds],
  )
  await transaction.commit()
  return true
}

async function getStaleGithubFriendIds(
  githubUserId: string,
  syncStartTime: string,
): Promise<string[]> {
  const { rows } = await write(
    `/* getStaleGithubFriendIds */ SELECT github_friend_id
     FROM github_friends
     WHERE github_user_id = $1 AND updated_at <= $2::timestamptz
     ORDER BY github_friend_id
     LIMIT $3`,
    [githubUserId, syncStartTime, FRIEND_MUTATION_BATCH_SIZE],
  )
  return rows.map(row => (row as { github_friend_id: string }).github_friend_id)
}

async function deleteGithubFriendBatch(
  githubUserId: string,
  userId: string,
  syncStartTime: string,
  friendIds: string[],
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubUserId, userId))) return false

  await transaction(
    `/* deleteGithubFriendBatch */ DELETE FROM github_friends
     WHERE github_user_id = $1
       AND github_friend_id = ANY($2::text[])
       AND updated_at <= $3::timestamptz`,
    [githubUserId, friendIds, syncStartTime],
  )
  await transaction.commit()
  return true
}

async function markGithubFriendSyncComplete(
  githubUserId: string,
  userId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockActiveGithubSyncOwner(transaction, userId)
  if (!(await githubSyncOwnerExists(transaction, githubUserId, userId))) return false

  await transaction(
    `/* markGithubFriendSyncComplete */ UPDATE github_accounts
     SET friends_synced_at = CURRENT_TIMESTAMP
     WHERE github_user_id = $1 AND user_id = $2`,
    [githubUserId, userId],
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
  githubUserId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* githubSyncOwnerExists */ SELECT 1 FROM github_accounts
     WHERE github_user_id = $1 AND user_id = $2 FOR UPDATE`,
    [githubUserId, userId],
  )
  return rows.length > 0
}
