import type { TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type UserDeletionTarget = {
  id: string
  username: string | null
}

async function lockTargetUserRow(
  query: TransactionQuery,
  userId: string,
): Promise<UserDeletionTarget | undefined> {
  const { rows } = await query<UserDeletionTarget>(sql`/* deleteUser:lockUserRow */
    SELECT id, username FROM users
    WHERE id = ${userId}
    FOR NO KEY UPDATE
  `)
  return rows[0]
}

/**
 * Locks the deletion target `FOR NO KEY UPDATE`. The privacy-fence UPDATE writes no column of a
 * unique index that a foreign key references (`users.id` stays unchanged). This lock does not
 * conflict with the `KEY SHARE` that `deleted_by_id` takes on the actor row. The actor row is
 * not locked beforehand.
 *
 * @throws 409 when the target row no longer exists.
 */
export async function lockUserDeletionRows(
  query: TransactionQuery,
  targetUserId: string,
  _requestedById: string,
): Promise<UserDeletionTarget> {
  const target = await lockTargetUserRow(query, targetUserId)
  assert(target, 409, 'User is already deleted')
  return target
}
