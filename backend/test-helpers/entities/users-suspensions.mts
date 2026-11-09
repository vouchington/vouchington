import { read, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function suspendTestUser(userId: string, reason?: string): Promise<void> {
  await write(sql`/* suspendTestUser */
    INSERT INTO user_suspensions (user_id, reason)
    VALUES (${userId}, ${reason ?? null})
  `)
}

export async function suspendTestUserGetId(userId: string, reason?: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* suspendTestUserGetId */
    INSERT INTO user_suspensions (user_id, reason)
    VALUES (${userId}, ${reason ?? null})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function lockTestUserSuspension(
  query: TransactionQuery,
  suspensionId: string,
): Promise<void> {
  await query(sql`/* lockTestUserSuspension */
    SELECT id FROM user_suspensions
    WHERE id = ${suspensionId}
    FOR UPDATE
  `)
}

export async function getTestUserSuspension(
  suspensionId: string,
): Promise<{ id: string; lifted_at: Date | null } | null> {
  const { rows } = await read<{ id: string; lifted_at: Date | null }>(
    sql`/* getTestUserSuspension */
    SELECT id, lifted_at FROM user_suspensions WHERE id = ${suspensionId} LIMIT 1
  `,
  )
  return rows[0] ?? null
}

export async function unsuspendTestUser(userId: string): Promise<void> {
  await write(sql`/* unsuspendTestUser */
    UPDATE user_suspensions
    SET lifted_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND lifted_at IS NULL
  `)
}

export { clearMfaForUser, setUserMarkdown } from './users-test-account-state.mts'
