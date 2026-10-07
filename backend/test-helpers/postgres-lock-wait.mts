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
 * advisory-pool users or an event-loop stall.
 */
export async function waitForTestPostgresLockWaiter(
  holderProcessId: number,
  queryMarker: string,
  observerPool: 'write' | 'advisoryLock' = 'write',
): Promise<void> {
  await pollUntilNotNull(
    async () => {
      const observation = sql`
        /* waitForTestPostgresLockWaiter */
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity activity
          WHERE activity.pid <> pg_backend_pid()
            AND activity.state = 'active'
            AND activity.wait_event_type = 'Lock'
            AND activity.query LIKE ${`%${queryMarker}%`}
            AND ${holderProcessId} = ANY(pg_blocking_pids(activity.pid))
        ) AS waiting
      `
      const { rows } =
        observerPool === 'advisoryLock'
          ? await advisoryLockPool.query<{ waiting: boolean }>(observation)
          : await write<{ waiting: boolean }>(observation)
      return rows[0]?.waiting ? true : null
    },
    5_000,
    10,
  ).catch(err => {
    throw new Error(`Operation did not wait for the test lock: ${queryMarker}`, { cause: err })
  })
}
