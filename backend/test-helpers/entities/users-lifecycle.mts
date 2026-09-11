import { read, type TransactionQuery, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function softDeleteUser(userId: string): Promise<void> {
  await write(sql`
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `)
}

export async function softDeleteUserDaysAgo(userId: string, daysAgo: number): Promise<void> {
  await write(sql`
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP - make_interval(days => ${daysAgo})
    WHERE id = ${userId}
  `)
}

export async function softDeleteUserAt(userId: string, deletedAt: Date): Promise<void> {
  await write(sql`
    UPDATE users
    SET deleted_at = ${deletedAt}
    WHERE id = ${userId}
  `)
}

export async function restoreUser(userId: string): Promise<void> {
  await write(sql`
    UPDATE users
    SET deleted_at = NULL
    WHERE id = ${userId}
  `)
}

export async function hardDeleteTestUser(userId: string): Promise<void> {
  await write(sql`DELETE FROM users WHERE id = ${userId}`)
}

export async function hardDeleteTestUserWithLockTimeout(
  userId: string,
  lockTimeout = '50ms',
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* hardDeleteTestUserWithLockTimeout */
        SELECT set_config('lock_timeout', ${lockTimeout}, TRUE)
      `)
    await query(sql`/* hardDeleteTestUserWithLockTimeout */ DELETE FROM users WHERE id = ${userId}`)
    await transaction.commit()
  }
}

export async function setTestUserVoteWeight(userId: string, voteWeight: number): Promise<void> {
  await write(sql`/* setTestUserVoteWeight */
    UPDATE users SET vote_weight = ${voteWeight} WHERE id = ${userId}
  `)
}

export async function softDeleteTestUserAndWaitBeforeCommit(
  userId: string,
  waitBeforeCommit: Promise<void>,
  afterDelete?: () => void,
  beforeDelete?: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await beforeDelete?.(query)
    await query(sql`/* softDeleteTestUserAndWaitBeforeCommit */
        UPDATE users
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
      `)
    afterDelete?.()
    await waitBeforeCommit
    await transaction.commit()
  }
}

export async function hardDeleteTestUserAndWaitBeforeCommit(
  userId: string,
  waitBeforeCommit: Promise<void>,
  afterDelete?: () => void,
  beforeDelete?: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await beforeDelete?.(query)
    await query(sql`/* hardDeleteTestUserAndWaitBeforeCommit */
        DELETE FROM users
        WHERE id = ${userId}
      `)
    afterDelete?.()
    await waitBeforeCommit
    await transaction.commit()
  }
}

export async function getTestUserRaw(userId: string): Promise<{
  id: string
  username: string | null
  markdown: string
  deleted_at: Date | null
  is_system: boolean
  vote_weight_recalculated_at: Date | null
} | null> {
  const { rows } = await read(sql`
    SELECT id, username, markdown, deleted_at, is_system, vote_weight_recalculated_at
    FROM users
    WHERE id = ${userId}
  `)
  return (
    (rows[0] as {
      id: string
      username: string | null
      markdown: string
      deleted_at: Date | null
      is_system: boolean
      vote_weight_recalculated_at: Date | null
    }) ?? null
  )
}

export async function setTestUserVoteWeightRecalculatedAt(
  userId: string,
  recalculatedAt: Date,
): Promise<void> {
  await write(sql`/* setTestUserVoteWeightRecalculatedAt */
    UPDATE users
    SET vote_weight_recalculated_at = ${recalculatedAt}
    WHERE id = ${userId}
  `)
}

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

export async function clearMfaForUser(userId: string): Promise<void> {
  await write(sql`DELETE FROM user_passkeys WHERE user_id = ${userId}`)
  await write(sql`DELETE FROM user_totp_authenticators WHERE user_id = ${userId}`)
}

export async function setUserMarkdown(userId: string, markdown: string): Promise<void> {
  await write(sql`UPDATE users SET markdown = ${markdown} WHERE id = ${userId}`)
}
