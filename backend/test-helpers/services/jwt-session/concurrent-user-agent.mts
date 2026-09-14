import { setTimeout as delay } from 'node:timers/promises'
import { beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function runTestActionsAcrossUserAgentConflict<TFirst, TSecond>(
  firstAction: (queryOptions: QueryOptions) => Promise<TFirst>,
  blockedAction: () => Promise<TSecond>,
): Promise<[TFirst, TSecond]> {
  await using holder = await beginTransaction()
  const { rows } = await holder<{ pid: number }>(
    sql`/* runTestActionsAcrossUserAgentConflict.holderPid */
      SELECT pg_backend_pid()::integer AS pid`,
  )
  const holderProcessId = rows[0]?.pid
  if (!holderProcessId) throw new Error('User-agent lock holder has no PostgreSQL process ID')
  const firstResult = await firstAction({ query: holder })

  const action = Promise.resolve().then(blockedAction)
  let waitError: unknown
  try {
    await waitForUserAgentInsertLock(action, holderProcessId)
  } catch (error) {
    waitError = error
  }
  await holder.commit()

  const result = await action
  if (waitError) throw waitError
  return [firstResult, result]
}

async function waitForUserAgentInsertLock(
  action: Promise<unknown>,
  holderProcessId: number,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { rows } = await write<{ blocked: boolean }>(
      sql`/* waitForUserAgentInsertLock */ SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE ${holderProcessId} = ANY(pg_blocking_pids(pid))
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE '%upsertAuthenticatedSession%'
      ) AS blocked`,
    )
    if (rows[0]?.blocked) return

    const settled = await Promise.race([
      action.then(
        () => true,
        () => true,
      ),
      delay(10).then(() => false),
    ])
    if (settled) throw new Error('Session upsert completed before waiting for the user-agent lock')
  }
  throw new Error('Session upsert did not wait for the user-agent lock')
}
