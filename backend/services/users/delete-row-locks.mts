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
    FOR UPDATE
  `)
  return rows[0]
}

/** The `users.deleted_by_id` foreign-key check needs exactly this lock on the actor row. */
async function lockActorUserRow(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* deleteUser:lockActorUserRow */
    SELECT id FROM users
    WHERE id = ${userId}
    FOR KEY SHARE
  `)
}

/**
 * Locks the deletion target (`FOR UPDATE`) and the requesting actor (`FOR KEY SHARE`) in ascending
 * user-id order, so reciprocal administrator deletions cannot form a lock cycle.
 *
 * The privacy-fence `UPDATE` writes `users.deleted_by_id = actor`, and that foreign-key check takes
 * `KEY SHARE` on the actor's `users` row. Without a shared order, `A deletes B` holds B and waits
 * on A while `B deletes A` holds A and waits on B (PostgreSQL `40P01`). Every row is locked once,
 * in its final mode, and never upgraded: a `KEY SHARE` then `FOR UPDATE` upgrade recreates the cycle.
 *
 * Ordering compares lowercase canonical UUID text, which sorts identically to PostgreSQL's
 * bytewise `uuid` comparison. Callers must hold the target's advisory lifecycle locks first, and
 * must not lock other `users` rows for this deletion afterwards.
 *
 * @throws 409 when the target row no longer exists.
 */
export async function lockUserDeletionRows(
  query: TransactionQuery,
  targetUserId: string,
  requestedById: string,
): Promise<UserDeletionTarget> {
  let target: UserDeletionTarget | undefined
  if (requestedById === targetUserId) {
    target = await lockTargetUserRow(query, targetUserId)
  } else if (targetUserId.toLowerCase() < requestedById.toLowerCase()) {
    target = await lockTargetUserRow(query, targetUserId)
    await lockActorUserRow(query, requestedById)
  } else {
    await lockActorUserRow(query, requestedById)
    target = await lockTargetUserRow(query, targetUserId)
  }
  assert(target, 409, 'User is already deleted')
  return target
}
