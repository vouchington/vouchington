import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function deleteBlueskyDataForUserBatch(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  const { rows: completions } = await query<{
    authorization_id: string
    bluesky_did: string
  }>(sql`/* deleteBlueskyDataForUserBatch:completions */
    SELECT authorization_id, bluesky_did FROM bluesky_link_completions
    WHERE user_id = ${userId} ORDER BY authorization_id LIMIT ${batchSize}`)
  if (completions.length > 0) {
    await lockBlueskyDids(
      completions.map(row => row.bluesky_did),
      query,
    )
    await query(sql`/* deleteBlueskyDataForUserBatch:deleteCompletions */
      DELETE FROM bluesky_link_completions
      WHERE user_id = ${userId}
        AND authorization_id = ANY(${completions.map(row => row.authorization_id)}::uuid[])`)
    return true
  }

  const { rows: accounts } = await query<{ bluesky_did: string }>(
    sql`/* deleteBlueskyDataForUserBatch:accounts */
      SELECT account.bluesky_did
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
      WHERE account.user_id = ${userId} OR link_auth.user_id = ${userId}
      ORDER BY account.bluesky_did LIMIT ${batchSize}`,
  )
  if (accounts.length > 0) {
    const dids = accounts.map(row => row.bluesky_did)
    await lockBlueskyDids(dids, query)
    await query(sql`/* deleteBlueskyDataForUserBatch:deleteAccounts */
      DELETE FROM bluesky_linked_accounts WHERE bluesky_did = ANY(${dids}::text[])`)
    return true
  }

  const { rows: authorizations } = await query<{
    id: string
    claimed_did: string | null
  }>(sql`/* deleteBlueskyDataForUserBatch:authorizations */
    SELECT id, claimed_did FROM bluesky_link_authorizations
    WHERE user_id = ${userId}
      AND status IN ('pending', 'callback_claimed', 'handoff_ready', 'attached')
    ORDER BY id LIMIT ${batchSize}`)
  if (authorizations.length === 0) return false
  await lockBlueskyDids(
    authorizations.flatMap(row => (row.claimed_did ? [row.claimed_did] : [])),
    query,
  )
  await query(sql`/* deleteBlueskyDataForUserBatch:retireAuthorizations */
    UPDATE bluesky_link_authorizations
    SET status = CASE WHEN status = 'attached' THEN 'revoked' ELSE 'rejected' END,
        handle = NULL
    WHERE id = ANY(${authorizations.map(row => row.id)}::uuid[])
      AND user_id = ${userId}`)
  return true
}

async function lockBlueskyDids(dids: string[], query: TransactionQuery): Promise<void> {
  if (dids.length === 0) return
  await query(sql`/* deleteBlueskyDataForUserBatch:lockDids */
    WITH ordered_dids AS MATERIALIZED (
      SELECT did FROM unnest(${[...new Set(dids)]}::text[]) AS did ORDER BY did
    )
    SELECT pg_advisory_xact_lock(hashtextextended(did, 1)) FROM ordered_dids`)
}
