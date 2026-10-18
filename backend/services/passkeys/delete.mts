import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-aggregation/enqueues/vote-weight'

export async function deletePasskey(
  currentUserId: string,
  passkeyId: string,
  lockedUserTransaction?: TransactionQuery,
): Promise<void> {
  // MFA protection already holds the active-user fence and all factor row locks.
  if (lockedUserTransaction) {
    const { rowCount } = await lockedUserTransaction(
      sql`/* deletePasskey */ DELETE FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId}`,
    )
    assert(rowCount === 1, 404, 'Passkey not found')
    await markPasskeyVoteWeightDirty(currentUserId, lockedUserTransaction)
    // enqueue deferred to caller so it runs after the outer transaction commits
  } else {
    await using query = await beginTransaction()
    await query(sql`/* deletePasskey */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`)
    const { rowCount } = await query(
      sql`/* deletePasskey */ DELETE FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId}`,
    )
    assert(rowCount === 1, 404, 'Passkey not found')
    await markPasskeyVoteWeightDirty(currentUserId, query)
    await query.commit()
    void enqueueRecalculateUserVoteWeight(currentUserId)
  }
}

async function markPasskeyVoteWeightDirty(userId: string, query: TransactionQuery): Promise<void> {
  await query(sql`/* deletePasskey: mark vote weight dirty */
    UPDATE users SET vote_weight_recalculated_at = NULL WHERE id = ${userId}`)
}
