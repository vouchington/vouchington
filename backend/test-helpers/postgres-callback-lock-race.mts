import { beginTransaction, write } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { createTestPostgresMultiWait } from './postgres-multi-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Witness a Pool.query callback lease waiting on an owned advisory lock. */
export async function observeTestCallbackQueryLockWait(): Promise<number | undefined> {
  const key = `callback-query-${crypto.randomUUID()}`
  await using holder = await beginTransaction()
  await holder(
    '/* observeTestCallbackQueryLockWait.hold */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [key],
  )
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key },
      queryMarker: 'observeTestCallbackQueryLockWait.wait',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const operation = write(
        '/* observeTestCallbackQueryLockWait.wait */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0)), 42::integer AS result',
        [key],
      )
      await waitForLock(operation)
      await holder.commit()
      const { rows } = await operation
      return rows[0]?.result as number | undefined
    },
  )
}

/** Witness the same callback lease through the multi-wait owner. */
export async function observeTestMultiCallbackQueryLockWait(): Promise<number | undefined> {
  const key = `multi-callback-query-${crypto.randomUUID()}`
  await using holder = await beginTransaction()
  await holder(
    '/* observeTestMultiCallbackQueryLockWait.hold */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [key],
  )
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  await using waits = await createTestPostgresMultiWait()
  const observed = await waits.start(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key },
      queryMarker: 'observeTestMultiCallbackQueryLockWait.wait',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    () =>
      write(
        '/* observeTestMultiCallbackQueryLockWait.wait */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0)), 42::integer AS result',
        [key],
      ),
  )
  await observed.waitForLock()
  await holder.commit()
  const { rows } = await observed.operation
  return rows[0]?.result as number | undefined
}
