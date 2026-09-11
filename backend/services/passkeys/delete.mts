import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'

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
    const { rows: targetRows } = await query(
      sql`/* deletePasskey */ SELECT id FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId} LIMIT 1`,
    )
    assert(targetRows.length > 0, 404, 'Passkey not found')

    await query(
      sql`/* deletePasskey */ DELETE FROM user_passkeys WHERE id = ${passkeyId} AND user_id = ${currentUserId}`,
    )
    await query.commit()
    void enqueueRecalculateUserVoteWeight(currentUserId)
  }
}
