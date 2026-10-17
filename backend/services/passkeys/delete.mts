import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-aggregation/enqueues/vote-weight'

export async function deletePasskey(
  currentUserId: string,
  passkeyId: string,
  opts?: QueryOptions,
): Promise<void> {
  if (opts?.query) {
    await opts.query(
      sql`/* deletePasskey */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`,
    )
    const { rowCount } = await opts.query(
      sql`/* deletePasskey */ DELETE FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId}`,
    )
    assert(rowCount === 1, 404, 'Passkey not found')
    // enqueue deferred to caller so it runs after the outer transaction commits
  } else {
    await using query = await beginTransaction()
    await query(sql`/* deletePasskey */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`)
    const { rowCount } = await query(
      sql`/* deletePasskey */ DELETE FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId}`,
    )
    assert(rowCount === 1, 404, 'Passkey not found')
    await query.commit()
    void enqueueRecalculateUserVoteWeight(currentUserId)
  }
}
