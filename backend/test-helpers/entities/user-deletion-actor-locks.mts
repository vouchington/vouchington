import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Reports whether another transaction currently holds a conflicting lock on the `users` row.
 * `update` conflicts with every row lock; `no-key-update` conflicts with FOR UPDATE and
 * FOR NO KEY UPDATE only, so a FOR KEY SHARE holder does not trip it.
 */
export async function isTestUserRowLocked(
  userId: string,
  probe: 'update' | 'no-key-update',
): Promise<boolean> {
  await using query = await beginTransaction()
  try {
    await (probe === 'update'
      ? query(
          sql`/* isTestUserRowLocked:update */ SELECT id FROM users WHERE id = ${userId} FOR UPDATE NOWAIT`,
        )
      : query(
          sql`/* isTestUserRowLocked:noKeyUpdate */ SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE NOWAIT`,
        ))
    return false
  } catch (err) {
    if ((err as { code?: string }).code === '55P03') return true
    throw err
  }
}

export async function getTestUserDeletedById(userId: string): Promise<string | null> {
  const { rows } = await write<{ deleted_by_id: string | null }>(sql`
    /* getTestUserDeletedById */
    SELECT deleted_by_id FROM users WHERE id = ${userId}
  `)
  return rows[0]?.deleted_by_id ?? null
}

export async function listTestUserDeletionRequestActorIds(userId: string): Promise<string[]> {
  const { rows } = await write<{ requested_by_id: string | null }>(sql`
    /* listTestUserDeletionRequestActorIds */
    SELECT requested_by_id FROM user_deletion_requests WHERE user_id = ${userId} ORDER BY id
  `)
  return rows.flatMap(row => (row.requested_by_id ? [row.requested_by_id] : []))
}
