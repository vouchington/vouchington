import type { TransactionQuery } from '@data-stores/psql'

type FriendProvider = 'facebook' | 'github' | 'x'

/** Resolve one indexed page; callers hold the target account row lock. */
export async function resolveFriendReferencePage(
  query: TransactionQuery,
  provider: FriendProvider,
  accountId: string,
  batchSize: number,
): Promise<{ resolved: number; hasMore: boolean }> {
  const accountTable = `${provider}_accounts`
  const friendTable = `${provider}_friends`
  const targetId = `friend_${provider}_account_id`
  const friendId = `${provider}_friend_id`
  const providerId = `${provider}_user_id`
  const eligible = `edge.${friendId} = account.${providerId} AND edge.${targetId} IS NULL
    AND (edge.${friendId}, edge.last_observed_at) >
      (account.${providerId}, COALESCE(account.friend_edges_invalidated_at, '-infinity'::timestamptz))`
  const updated = await query(
    `/* resolveFriendReferencePage */ WITH candidates AS (
       SELECT eligible.id FROM ${accountTable} account
       CROSS JOIN LATERAL (
         SELECT edge.id FROM ${friendTable} edge WHERE ${eligible}
         ORDER BY edge.last_observed_at, edge.id
         LIMIT $2::integer FOR UPDATE OF edge SKIP LOCKED
       ) eligible
       WHERE account.id = $1::uuid
     ) UPDATE ${friendTable} target SET ${targetId} = $1::uuid
       FROM candidates WHERE target.id = candidates.id`,
    [accountId, batchSize],
  )
  const { rows: remaining } = await query(
    `/* hasUnresolvedFriendReferences */ SELECT eligible.id FROM ${accountTable} account
     CROSS JOIN LATERAL (
       SELECT edge.id FROM ${friendTable} edge WHERE ${eligible}
       ORDER BY edge.last_observed_at, edge.id LIMIT 1
     ) eligible
     WHERE account.id = $1::uuid`,
    [accountId],
  )
  return { resolved: updated.rowCount ?? 0, hasMore: remaining.length > 0 }
}
