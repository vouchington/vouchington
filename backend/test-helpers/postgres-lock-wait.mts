import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

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
