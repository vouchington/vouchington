import type { TransactionQuery } from '@data-stores/psql'

type FriendProvider = 'facebook' | 'github' | 'x'

/** Resolve one indexed page; callers hold the target account row lock. */
export async function resolveFriendReferencePage(
  query: TransactionQuery,
  provider: FriendProvider,
  accountId: string,
  providerUserId: string,
  batchSize: number,
): Promise<{ resolved: number; hasMore: boolean }> {
  const friendTable = `${provider}_friends`
  const targetId = `friend_${provider}_account_id`
  const friendId = `${provider}_friend_id`
  const eligible = `edge.${friendId} = $2 AND edge.${targetId} IS NULL`
  const updated = await query(
    `/* resolveFriendReferencePage */ WITH candidates AS (
       SELECT edge.id FROM ${friendTable} edge
       WHERE ${eligible}
       ORDER BY edge.id LIMIT $3::integer FOR UPDATE OF edge SKIP LOCKED
     ) UPDATE ${friendTable} target SET ${targetId} = $1::uuid
       FROM candidates WHERE target.id = candidates.id`,
    [accountId, providerUserId, batchSize],
  )
  const { rows } = await query<{ more: boolean }>(
    `/* hasUnresolvedFriendReferences */ SELECT EXISTS (
       SELECT 1 FROM ${friendTable} edge
       WHERE edge.${friendId} = $1 AND edge.${targetId} IS NULL LIMIT 1) AS more`,
    [providerUserId],
  )
  return { resolved: updated.rowCount ?? 0, hasMore: rows[0]?.more ?? false }
}
