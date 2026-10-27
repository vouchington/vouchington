import { onTestFinished } from 'vitest'
import {
  beginTransaction,
  writePool,
  type OwnedTransaction,
  type QueryOptions,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  observeTestAdvisoryLockNotice,
  observeTestTransactionLockNotice,
} from './postgres-advisory-lock-notice.mts'

export async function runTestActionsAcrossUserAgentConflict<TFirst, TSecond>(
  firstAction: (queryOptions: QueryOptions) => Promise<TFirst>,
  blockedAction: (queryOptions: QueryOptions) => Promise<TSecond>,
): Promise<[TFirst, TSecond]> {
  await using holder = await beginTransaction()
  const firstResult = await firstAction({ query: holder })
  const { rows: identities } = await holder<{ transaction_id: string }>(sql`
    /* runTestActionsAcrossUserAgentConflict.identity */
    SELECT pg_current_xact_id()::text AS transaction_id
  `)
  const identity = identities[0]
  if (!identity) throw new Error('User-agent holder has no PostgreSQL transaction ID')
  const { rows: advisoryLocks } = await holder<{ lock_tag: string }>(sql`
    /* runTestActionsAcrossUserAgentConflict.advisoryLocks */
    SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
      objid::text || ',' || objsubid::text || ']' AS lock_tag
    FROM pg_locks
    WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND mode = 'ExclusiveLock' AND granted
    ORDER BY database, classid, objid, objsubid
    LIMIT 2
  `)
  if (advisoryLocks.length > 1)
    throw new Error('User-agent fixture expects at most one owned session advisory lock')

  const client = await writePool.connect()
  const advisoryLock = advisoryLocks[0]
  const observer = advisoryLock
    ? observeTestAdvisoryLockNotice(client, advisoryLock.lock_tag)
    : observeTestTransactionLockNotice(client, identity.transaction_id)
  let contender: OwnedTransaction | undefined
  let actionOutcome: Promise<[PromiseSettledResult<TSecond>]> | undefined
  let holderReleased: Promise<void> | undefined
  let contenderFinished: Promise<void> | undefined
  let cleanupPromise: Promise<void> | undefined
  let closed = false
  const releaseHolder = () => (holderReleased ??= holder.commit())
  const finishContender = (commit: boolean): Promise<void> => {
    if (!contender) return Promise.resolve()
    const transaction = contender
    return (contenderFinished ??= (async () => {
      try {
        if (commit) await transaction.commit()
        else await transaction.rollback()
      } finally {
        await transaction[Symbol.asyncDispose]()
      }
    })())
  }
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      closed = true
      const failures: unknown[] = []
      try {
        await releaseHolder()
      } catch (err) {
        failures.push(err)
      }
      await actionOutcome
      try {
        await finishContender(false)
      } catch (err) {
        failures.push(err)
      }
      try {
        await observer.close()
      } catch (err) {
        failures.push(err)
      }
      const failure = failures.length
        ? new AggregateError(failures, 'User-agent conflict fixture cleanup failed')
        : undefined
      client.release(failure)
      if (failure) throw failure
    })())
  onTestFinished(cleanup)

  try {
    await observer.ready
    if (closed) throw new Error('User-agent conflict fixture is already closed')
    actionOutcome = Promise.allSettled([
      (async () => {
        const transaction = await beginTransaction({ client })
        contender = transaction
        if (closed) throw new Error('User-agent conflict fixture is already closed')
        return blockedAction({ query: transaction })
      })(),
    ] as const)
    let waitFailure: unknown
    try {
      await observer.wait(actionOutcome)
    } catch (err) {
      waitFailure = err
    }
    await releaseHolder()
    const [outcome] = await actionOutcome
    if (outcome.status === 'rejected')
      throw normalizeFailure(outcome.reason, 'User-agent action failed')
    if (waitFailure)
      throw new Error('Session upsert completed before waiting for the user-agent lock', {
        cause: waitFailure,
      })
    if (closed) throw new Error('User-agent conflict fixture is already closed')
    await finishContender(true)
    return [firstResult, outcome.value]
  } finally {
    await cleanup()
  }
}

function normalizeFailure(reason: unknown, message: string): Error {
  return reason instanceof Error ? reason : new Error(message, { cause: reason })
}
