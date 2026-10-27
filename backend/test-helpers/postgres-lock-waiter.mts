import { onTestFinished } from 'vitest'
import {
  beginTransaction,
  writePool,
  type OwnedTransaction,
  type PoolClient,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  observeTestAdvisoryLockNotice,
  observeTestTransactionLockNotice,
} from './postgres-advisory-lock-notice.mts'
import {
  observeTestPostgresLockQuery,
  type TestPostgresLockQuery,
} from './postgres-lock-query-observation.mts'

type HeldLock = { kind: 'transaction' } | { kind: 'advisory64'; key: string }
type Observer = ReturnType<typeof observeTestTransactionLockNotice>

/** Own the holder's failure release and one real borrowed contender transaction. */
export async function createTestPostgresLockWaiter(options: {
  holder: OwnedTransaction
  lock: HeldLock
  selected: TestPostgresLockQuery
}) {
  let closed = false
  let cleanupReported = false
  let cleanupPromise: Promise<void> | undefined
  let reservation: Promise<PoolClient> | undefined
  let setup: Promise<void> | undefined
  let client: PoolClient | undefined
  let transaction: OwnedTransaction | undefined
  let observer: Observer | undefined
  let observation: ReturnType<typeof observeTestPostgresLockQuery> | undefined
  let actionOutcome: Promise<[PromiseSettledResult<unknown>]> | undefined
  let primaryFailure: { reason: unknown } | undefined
  const ended = Promise.withResolvers<void>()
  const onEnd = () => ended.resolve()
  const requireOpen = () => {
    if (closed) throw new Error('Owned PostgreSQL waiter is already closed')
  }
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      closed = true
      const failures: unknown[] = []
      try {
        await options.holder[Symbol.asyncDispose]()
      } catch (err) {
        failures.push(err)
      }
      await reservation?.catch(() => undefined)
      await setup?.catch(() => undefined)
      const settled = await actionOutcome
      try {
        await transaction?.[Symbol.asyncDispose]()
      } catch (err) {
        failures.push(err)
      }
      observation?.restore()
      try {
        await observer?.close()
      } catch (err) {
        failures.push(err)
      }
      if ((observation?.pendingQueries ?? 0) !== 0)
        failures.push(new Error('Owned lock queries did not finish draining'))
      if (failures.length && primaryFailure) failures.unshift(primaryFailure.reason)
      else if (failures.length && settled?.[0].status === 'rejected')
        failures.unshift(settled[0].reason)
      const failure = failures.length
        ? new AggregateError(failures, 'Owned PostgreSQL waiter cleanup failed')
        : undefined
      if (client) {
        client.release(failure)
        if (failure) await ended.promise
        client.off('end', onEnd)
      }
      if (failure) throw failure
    })())
  const dispose = async () => {
    try {
      await cleanup()
    } finally {
      cleanupReported = true
    }
  }
  onTestFinished(() => (cleanupReported ? undefined : dispose()))
  try {
    setup = (async () => {
      const lock = await readHeldLock(options.holder, options.lock)
      requireOpen()
      reservation = writePool.connect()
      client = await reservation
      client.once('end', onEnd)
      requireOpen()
      const eligible = () => observation?.selectedPending === true
      observer =
        lock.kind === 'advisory'
          ? observeTestAdvisoryLockNotice(client, lock.tag, eligible)
          : observeTestTransactionLockNotice(client, lock.transactionId, eligible)
      await observer.ready
      requireOpen()
      transaction = await beginTransaction({ client })
      requireOpen()
      observation = observeTestPostgresLockQuery(client, options.selected)
    })()
    await setup
    if (!transaction || !observer || closed)
      throw new Error('Owned PostgreSQL waiter was not admitted')
    const readyObserver = observer
    return {
      query: transaction,
      waitForLock(action: Promise<unknown>): Promise<void> {
        if (closed || actionOutcome)
          throw new Error('Owned PostgreSQL waiter accepts one live action')
        actionOutcome = Promise.allSettled([action] as const)
        return readyObserver.wait(actionOutcome)
      },
      [Symbol.asyncDispose]: dispose,
    }
  } catch (err) {
    primaryFailure = { reason: err }
    await dispose()
    throw err
  }
}

async function readHeldLock(holder: OwnedTransaction, lock: HeldLock) {
  if (lock.kind === 'transaction') {
    const { rows } = await holder<{ transaction_id: string }>(sql`
      /* createTestPostgresLockWaiter.transaction */
      SELECT pg_current_xact_id()::text AS transaction_id
    `)
    const transactionId = rows[0]?.transaction_id
    if (!transactionId) throw new Error('Owned holder has no PostgreSQL transaction ID')
    return { kind: 'transaction' as const, transactionId }
  }
  const { rows } = await holder<{ lock_tag: string }>(sql`
    /* createTestPostgresLockWaiter.advisory */
    SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
      objid::text || ',' || objsubid::text || ']' AS lock_tag
    FROM pg_locks
    WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted AND mode = 'ExclusiveLock'
      AND objsubid = 1
      AND classid::bigint = ((hashtextextended(${lock.key}, 0) >> 32) & 4294967295)
      AND objid::bigint = (hashtextextended(${lock.key}, 0) & 4294967295)
    LIMIT 2
  `)
  const tag = rows[0]?.lock_tag
  if (!tag || rows.length !== 1)
    throw new Error('Owned holder does not have the exact advisory lock')
  return { kind: 'advisory' as const, tag }
}
