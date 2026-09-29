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

  const actionOutcome = Promise.allSettled([Promise.resolve().then(blockedAction)] as const)
  let waitFailure: { reason: unknown } | undefined
  try {
    await waitForUserAgentInsertLock(actionOutcome, holderProcessId)
  } catch (error) {
    waitFailure = { reason: error }
  }
  await holder.commit()

  const [outcome] = await actionOutcome
  if (outcome.status === 'rejected')
    throw normalizeFailure(outcome.reason, 'User-agent action failed')
  if (waitFailure) throw normalizeFailure(waitFailure.reason, 'User-agent lock wait failed')
  return [firstResult, outcome.value]
}

async function waitForUserAgentInsertLock(
  actionOutcome: Promise<[PromiseSettledResult<unknown>]>,
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

    const [outcome] = await Promise.race([
      actionOutcome,
      delay(10).then(() => [undefined] as const),
    ])
    if (outcome?.status === 'rejected')
      throw normalizeFailure(outcome.reason, 'User-agent action failed')
    if (outcome?.status === 'fulfilled')
      throw new Error('Session upsert completed before waiting for the user-agent lock')
  }
  throw new Error('Session upsert did not wait for the user-agent lock')
}

function normalizeFailure(reason: unknown, message: string): Error {
  return reason instanceof Error ? reason : new Error(message, { cause: reason })
}
