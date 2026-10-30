import { beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import sql from 'sql-template-strings'
import { recordCopyrightRepeatInfringerReviewOutcome } from '../services/copyright-notices/repeat-infringer-outcomes.mts'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'
import { withTestCopyrightAuthorLock } from './copyright-author-lock-owner.mts'

export type TestCopyrightConnection = { client: PoolClient }
type Connection = TestCopyrightConnection
type Action<T = unknown> = (connection: Connection) => Promise<T>

/** The existing joined API keeps post-commit actions on this actual, explicitly committed owner. */
export async function runTestCopyrightReviewOutcome(
  input: Parameters<typeof recordCopyrightRepeatInfringerReviewOutcome>[0],
  connection: Connection,
) {
  await using transaction = await beginTransaction(connection)
  const result = await recordCopyrightRepeatInfringerReviewOutcome(input, { query: transaction })
  await transaction.commit()
  return result
}

export async function confirmTestRepeatInfringerNoticesConcurrently(
  accountId: string,
  operations: Action[],
): Promise<void> {
  await withTestCopyrightAuthorLock(accountId, operations.length, async owner => {
    const actions = operations.map((operation, index) => owner.start(index, operation))
    await Promise.all(actions.map(action => action.wait()))
    await owner.release()
    const outcomes = (await Promise.all(actions.map(action => action.settled))).flat()
    const failures = outcomes.flatMap(outcome =>
      outcome.status === 'rejected' ? [outcome.reason] : [],
    )
    if (failures.length === 1) {
      const failure = Promise.withResolvers<never>()
      failure.reject(failures[0])
      return failure.promise
    }
    if (failures.length)
      throw new AggregateError(failures, 'Copyright confirmations failed', { cause: failures[0] })
  })
}

export async function observeTestRepeatInfringerAuthorLock<Result, Observation>(input: {
  accountId: string
  operation: Action<Result>
  observe: () => Promise<Observation>
}): Promise<{ result: Result; observation: Observation }> {
  return withTestCopyrightAuthorLock(input.accountId, 1, async owner => {
    const action = owner.start(0, input.operation)
    await action.wait()
    const observation = await input.observe()
    await owner.release()
    const [outcome] = await action.settled
    if (outcome?.status !== 'fulfilled') {
      const failure = Promise.withResolvers<never>()
      failure.reject(outcome?.reason)
      return failure.promise
    }
    return { result: outcome.value, observation }
  })
}

export async function raceTestRepeatInfringerAuthorLock(input: {
  accountId: string
  operations: Action[]
  stageFirstAtPurgeGate?: boolean
}): Promise<PromiseSettledResult<unknown>[]> {
  if (input.operations.length !== 2)
    throw new Error('Copyright outcome race requires exactly two contenders')

  const clients: PoolClient[] = []
  const observers: ReturnType<typeof observeTestAdvisoryLockNotice>[] = []
  const actions: Promise<PromiseSettledResult<unknown>[]>[] = []
  const holder = await beginTransaction()
  let released = false
  try {
    for (const [index] of input.operations.entries()) clients[index] = await writePool.connect()

    await holder(sql`/* copyrightOutcomePurgeGateOwner.hold */
      SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
    const { rows: lockRows } = await holder<{ holder_pid: number; lock_tag: string }>(sql`
      /* copyrightOutcomePurgeGateOwner.identity */
      SELECT pg_backend_pid()::integer AS holder_pid,
        'advisory lock [' || database::text || ',' || classid::text || ',' ||
        objid::text || ',' || objsubid::text || ']' AS lock_tag
      FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted
        AND classid::bigint = ((hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0) & 4294967295)
        AND objsubid = 1
    `)
    const lock = lockRows[0]
    if (!lock || lockRows.length !== 1) throw new Error('Missing exact final purge advisory lock')

    for (const client of clients)
      observers.push(observeTestAdvisoryLockNotice(client, lock.lock_tag))
    const sessions = await Promise.all(observers.map(observer => observer.ready))
    for (const [index, operation] of input.operations.entries()) {
      const client = clients[index]
      if (!client) throw new Error('Missing owned copyright contender connection')
      const action = Promise.resolve().then(() => operation({ client }))
      actions.push(Promise.allSettled([action]))
      if (index === 0 && input.stageFirstAtPurgeGate) await observers[index]!.wait(actions[index]!)
    }

    await Promise.all(observers.map((observer, index) => observer.wait(actions[index]!)))
    await holder(sql`/* copyrightOutcomePurgeGateOwner.clearActivitySnapshot */
      SELECT pg_stat_clear_snapshot()`)
    const { rows: proof } = await holder<{ waiting_count: number }>(sql`
      /* copyrightOutcomePurgeGateOwner.validateContenders */
      SELECT count(*)::integer AS waiting_count
      FROM pg_stat_activity activity
      WHERE activity.pid = ANY(${sessions.map(session => session.processId)}::integer[])
        AND activity.application_name = ANY(${sessions.map(session => session.applicationName)}::text[])
        AND activity.state = 'active'
        AND EXISTS (SELECT 1 FROM pg_locks queued
          WHERE queued.pid = activity.pid AND queued.locktype = 'advisory'
            AND NOT queued.granted
            AND 'advisory lock [' || queued.database::text || ',' || queued.classid::text || ',' ||
              queued.objid::text || ',' || queued.objsubid::text || ']' = ${lock.lock_tag})
        AND ${lock.holder_pid} = ANY(pg_blocking_pids(activity.pid))
    `)
    if (proof[0]?.waiting_count !== input.operations.length)
      throw new Error('Both copyright contenders did not queue on the exact final purge lock')

    await holder.commit()
    released = true
    return (await Promise.all(actions)).flat()
  } finally {
    if (!released) await holder.rollback()
    await Promise.allSettled(actions)
    for (let index = observers.length - 1; index >= 0; index--) {
      try {
        await observers[index]!.close()
      } finally {
        clients[index]?.release()
      }
    }
    for (let index = observers.length; index < clients.length; index++) clients[index]!.release()
    await holder[Symbol.asyncDispose]()
  }
}
