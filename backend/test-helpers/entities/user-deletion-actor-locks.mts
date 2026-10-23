import { beginTransaction, write, type QueryInput, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { postgresLockQuery, getTestPostgresBackendProcessId } from '../postgres-lock-observers.mts'
import { startPausedTestUserDeletionWriter } from './user-deletion.mts'

type HeldTestLock = {
  abort(): void
  completed: Promise<void>
  holderProcessId: number
  release(): void
}

async function holdTestLock(
  lockRows: (query: TransactionQuery) => Promise<void>,
): Promise<HeldTestLock> {
  let holderProcessId: number | undefined
  const paused = await startPausedTestUserDeletionWriter(async query => {
    await lockRows(query)
    holderProcessId = await getTestPostgresBackendProcessId(postgresLockQuery(query))
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
  } catch (err) {
    if ((err as { code?: string }).code === '55P03') return true
    throw err
  }
}

/** Takes the deletion request's retained-identity key share and fails immediately when blocked. */
export async function lockTestRetainedUserIdentityKeyShareNowait(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* lockTestRetainedUserIdentityKeyShareNowait */
    SELECT id FROM retained_user_identities WHERE id = ${userId} FOR KEY SHARE NOWAIT
  `)
  await query.commit()
}

function retainedIdentityKeyShareNowait(
  statement: QueryInput,
): { text: string; values: ReadonlyArray<unknown> } | undefined {
  if (
    typeof statement === 'string' ||
    !statement.text.includes('/* createUserDeletionRequest:validateUsers */')
  ) {
    return undefined
  }
  const rewritten = statement.text.replace(
    'FOR KEY SHARE OF identity',
    'FOR KEY SHARE OF identity NOWAIT',
  )
  if (rewritten === statement.text) {
    throw new Error('Deletion request validation no longer takes FOR KEY SHARE OF identity')
  }
  return { text: rewritten, values: statement.values }
}

/**
 * Runs a deletion-request producer whose retained-identity `KEY SHARE` is `NOWAIT`, so a
 * conflicting holder fails with `55P03` instead of waiting.
 */
export async function withTestUserDeletionRequestKeyShareNowait(
  run: (query: TransactionQuery) => Promise<unknown>,
): Promise<void> {
  await using query = await beginTransaction()
  let rewroteKeyShare = false
  const producer = Object.assign(
    async (statement: QueryInput, values?: ReadonlyArray<unknown>) => {
      const rewritten = retainedIdentityKeyShareNowait(statement)
      if (rewritten !== undefined) {
        rewroteKeyShare = true
        return query(rewritten.text, rewritten.values)
      }
      return query(statement, values)
    },
    { client: query.client },
  ) as TransactionQuery
  await run(producer)
  if (!rewroteKeyShare) {
    throw new Error('Deletion request did not validate the retained identity')
  }
  await query.commit()
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
