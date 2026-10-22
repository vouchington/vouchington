import { advisoryLockPool, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { pollUntilNotNull } from './polling.mts'

/** Returns the PostgreSQL backend PID serving `query`'s current connection. */
export async function getTestPostgresBackendProcessId(query: QueryExecutor): Promise<number> {
  const { rows } = await query<{ process_id: number }>(sql`
    /* getTestPostgresBackendProcessId */
    SELECT pg_backend_pid()::integer AS process_id
  `)
  const processId = rows[0]?.process_id
  if (processId === undefined) throw new Error('PostgreSQL did not return a backend process ID')
  return processId
}

/** Returns the backend PID holding an exact session advisory lock owned by this test. */
export async function getTestPostgresAdvisoryLockHolderProcessId(input: {
  key: string
  mode?: 'exclusive' | 'shared'
  namespace?: number
}): Promise<number> {
  const lockMode = input.mode === 'shared' ? 'ShareLock' : 'ExclusiveLock'
  const result =
    input.namespace === undefined
      ? await write<{ process_id: number }>(sql`
          /* getTestPostgresAdvisoryLockHolderProcessId:oneInt */
          SELECT pid::integer AS process_id
          FROM pg_locks
          WHERE locktype = 'advisory'
            AND mode = ${lockMode}
            AND granted
            AND objsubid = 1
            AND classid::bigint = ((hashtextextended(${input.key}, 0) >> 32) & 4294967295)
            AND objid::bigint = (hashtextextended(${input.key}, 0) & 4294967295)
        `)
      : await write<{ process_id: number }>(sql`
          /* getTestPostgresAdvisoryLockHolderProcessId:twoInt */
          SELECT pid::integer AS process_id
          FROM pg_locks
          WHERE locktype = 'advisory'
            AND mode = ${lockMode}
            AND granted
            AND objsubid = 2
            AND classid = ${input.namespace}::oid
            AND objid = hashtext(${input.key})::oid
        `)
  const processId = result.rows[0]?.process_id
  if (processId === undefined)
    throw new Error('PostgreSQL did not report the test advisory-lock holder')
  return processId
}

/**
 * Waits until a query bearing `queryMarker` is blocked by this test's lock-holding backend.
 * Use the adapter-owned primary advisory pool when the held lock and blocked operations can
 * occupy every write connection; the observer must run before the holder is released. The
 * advisory pool has its own finite capacity, so this does not prevent contention with other
 * advisory-pool users or an event-loop stall. Passing a previously acquired transaction
 * executor reserves the observer connection before the holder or blocked operation starts.
 * Its transaction-local activity snapshot is discarded before each observation.
 * Supply waiterProcessId to distinguish this operation from other matching waiters.
 */
export async function waitForTestPostgresLockWaiter(
  holderProcessId: number,
  queryMarker: string,
  observerPool: 'write' | 'advisoryLock' | QueryExecutor = 'write',
  onDiagnostic?: (diagnostic: {
    phase: 'snapshot-clear-start' | 'snapshot-cleared' | 'waiter-query-start' | 'waiter-query'
    waiting: boolean
  }) => void,
  signal?: AbortSignal,
  waiterProcessId?: number,
): Promise<void> {
  await pollUntilNotNull(
    async () => {
      signal?.throwIfAborted()
      if (typeof observerPool === 'function') {
        onDiagnostic?.({ phase: 'snapshot-clear-start', waiting: false })
        signal?.throwIfAborted()
        await observerPool(sql`/* waitForTestPostgresLockWaiter.refresh */
          SELECT pg_stat_clear_snapshot()`)
        signal?.throwIfAborted()
        onDiagnostic?.({ phase: 'snapshot-cleared', waiting: false })
      }
      const observation = sql`
        /* waitForTestPostgresLockWaiter */
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity activity
          WHERE activity.pid <> pg_backend_pid()
            AND (${waiterProcessId ?? null}::integer IS NULL OR activity.pid = ${waiterProcessId ?? null}::integer)
            AND activity.state = 'active'
            AND activity.wait_event_type = 'Lock'
            AND activity.query LIKE ${`%${queryMarker}%`}
            AND ${holderProcessId} = ANY(pg_blocking_pids(activity.pid))
        ) AS waiting
      `
      onDiagnostic?.({ phase: 'waiter-query-start', waiting: false })
      signal?.throwIfAborted()
      const { rows } =
        typeof observerPool === 'function'
          ? await observerPool<{ waiting: boolean }>(observation)
          : observerPool === 'advisoryLock'
            ? await advisoryLockPool.query<{ waiting: boolean }>(observation)
            : await write<{ waiting: boolean }>(observation)
      signal?.throwIfAborted()
      onDiagnostic?.({ phase: 'waiter-query', waiting: rows[0]?.waiting ?? false })
      return rows[0]?.waiting ? true : null
    },
    5_000,
    10,
  ).catch(err => {
    const cause =
      signal?.aborted && err !== signal.reason
        ? new SuppressedError(err, signal.reason, 'Lock observation failed during cancellation')
        : err
    throw new Error(`Operation did not wait for the test lock: ${queryMarker}`, { cause })
  })
}

/**
 * Waits until one backend is blocked by `holderProcessId` on `directQueryMarker` and a second
 * backend is blocked by that first backend on one of `blockedByDirectQueryMarkers`.
 *
 * Use this when the second operation cannot reach the holder's lock because the first operation
 * already holds a conflicting row lock. `pg_blocking_pids` reports only the direct blocker, so
 * the second wait is the transitive link.
 */
export async function waitForTestPostgresBlockedLockChain(
  holderProcessId: number,
  directQueryMarker: string,
  blockedByDirectQueryMarkers: readonly string[],
  observerPool: 'write' | 'advisoryLock' | QueryExecutor = 'advisoryLock',
): Promise<void> {
  const directPattern = `%${directQueryMarker}%`
  const blockedPatterns = blockedByDirectQueryMarkers.map(marker => `%${marker}%`)
  await pollUntilNotNull(
    async () => {
      if (typeof observerPool === 'function') {
        await observerPool(sql`/* waitForTestPostgresBlockedLockChain.refresh */
          SELECT pg_stat_clear_snapshot()`)
      }
      const observation = sql`
        /* waitForTestPostgresBlockedLockChain */
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity direct_waiter
          JOIN pg_stat_activity indirect_waiter
            ON direct_waiter.pid = ANY(pg_blocking_pids(indirect_waiter.pid))
          WHERE direct_waiter.pid <> pg_backend_pid()
            AND indirect_waiter.pid <> pg_backend_pid()
            AND direct_waiter.state = 'active'
            AND indirect_waiter.state = 'active'
            AND direct_waiter.wait_event_type = 'Lock'
            AND indirect_waiter.wait_event_type = 'Lock'
            AND direct_waiter.query LIKE ${directPattern}
            AND ${holderProcessId} = ANY(pg_blocking_pids(direct_waiter.pid))
            AND indirect_waiter.query LIKE ANY(${blockedPatterns}::text[])
        ) AS waiting
      `
      const { rows } =
        typeof observerPool === 'function'
          ? await observerPool<{ waiting: boolean }>(observation)
          : observerPool === 'advisoryLock'
            ? await advisoryLockPool.query<{ waiting: boolean }>(observation)
            : await write<{ waiting: boolean }>(observation)
      return rows[0]?.waiting ? true : null
    },
    5_000,
    10,
  ).catch(err => {
    throw new Error(
      `Operations did not form a lock chain behind the test holder: ${directQueryMarker}`,
      { cause: err },
    )
  })
}
