import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { pollUntilNotNull } from '../polling.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'
import { startPausedTestUserDeletionWriter } from './user-deletion.mts'

type HeldTestLock = { completed: Promise<void>; holderProcessId: number; release(): void }

async function holdTestLock(
  lockRows: (query: TransactionQuery) => Promise<void>,
): Promise<HeldTestLock> {
  let holderProcessId: number | undefined
  const paused = await startPausedTestUserDeletionWriter(async query => {
    await lockRows(query)
    holderProcessId = await getTestPostgresBackendProcessId(query)
  })
  if (holderProcessId === undefined) throw new Error('Test lock holder had no PostgreSQL backend')
  return { ...paused, holderProcessId }
}

/** Holds `FOR UPDATE` on a live `users` row until released. */
export async function holdTestUserRowLock(userId: string): Promise<HeldTestLock> {
  return holdTestLock(async query => {
    await query(sql`/* holdTestUserRowLock */ SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  })
}

/**
 * Holds FOR UPDATE on retained identities so a deletion stalls at the `KEY SHARE` its request and
 * audit foreign keys take, after it has locked its `users` rows.
 */
export async function holdTestRetainedUserIdentityLocks(userIds: string[]): Promise<HeldTestLock> {
  return holdTestLock(async query => {
    await query(sql`/* holdTestRetainedUserIdentityLocks */
      SELECT id FROM retained_user_identities WHERE id = ANY(${userIds}::uuid[]) ORDER BY id FOR UPDATE
    `)
  })
}

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
  } catch (error) {
    if ((error as { code?: string }).code === '55P03') return true
    throw error
  }
}

/**
 * Waits until `expected` account-deletion statements are blocked by `holderProcessId`, directly or
 * through one intermediate deletion transaction that the holder blocks.
 */
export async function waitForTestUserDeletionBackendsBlockedBehind(
  holderProcessId: number,
  expected: number,
): Promise<void> {
  const blocked = await pollUntilNotNull(
    async () => {
      const { rows } = await write<{ count: number }>(sql`
        /* waitForTestUserDeletionBackendsBlockedBehind */
        SELECT COUNT(*)::int AS count
        FROM pg_stat_activity activity
        WHERE activity.pid <> pg_backend_pid()
          AND activity.state = 'active'
          AND activity.wait_event_type = 'Lock'
          AND activity.query LIKE ANY (ARRAY['%/* deleteUser%', '%/* createUserDeletionRequest%'])
          AND (
            ${holderProcessId}::int = ANY(pg_blocking_pids(activity.pid))
            OR EXISTS (
              SELECT 1
              FROM unnest(pg_blocking_pids(activity.pid)) AS blocker(pid)
              WHERE ${holderProcessId}::int = ANY(pg_blocking_pids(blocker.pid))
            )
          )
      `)
      return (rows[0]?.count ?? 0) >= expected ? true : null
    },
    10_000,
    10,
  )
  if (!blocked)
    throw new Error(`Expected ${expected} account deletions blocked behind the test lock`)
}

export async function getTestUserDeletedById(userId: string): Promise<string | null> {
  const { rows } = await write<{ deleted_by_id: string | null }>(sql`
    /* getTestUserDeletedById */
    SELECT deleted_by_id FROM users WHERE id = ${userId}
  `)
  return rows[0]?.deleted_by_id ?? null
}

export async function listTestUserDeletionAuditActorIds(userId: string): Promise<string[]> {
  const { rows } = await write<{ requested_by_id: string | null }>(sql`
    /* listTestUserDeletionAuditActorIds */
    SELECT requested_by_id FROM user_deletion_audit_logs WHERE user_id = ${userId} ORDER BY id
  `)
  return rows.flatMap(row => (row.requested_by_id ? [row.requested_by_id] : []))
}
