import type { QueryExecutor } from '@data-stores/psql'
import { rejectQuery } from './injected-failures.mts'

type PostSeedBackend = {
  pid: number
  jit: string
  work_mem: string
  plan_cache_mode: string
  server_version: string
}

export async function getPostSeedDiagnosticsBackend(
  query: QueryExecutor,
): Promise<PostSeedBackend> {
  const { rows } = await query<PostSeedBackend>(
    `/* postSeedDiagnosticsTestPid */ SELECT pg_backend_pid() AS pid,
        current_setting('jit') AS jit,
        current_setting('work_mem') AS work_mem,
        current_setting('plan_cache_mode') AS plan_cache_mode,
        current_setting('server_version') AS server_version`,
  )
  return rows[0]
}

export async function getPostSeedDiagnosticsBlockerPid(query: QueryExecutor): Promise<number> {
  const { rows } = await query<{ pid: number }>(
    '/* postSeedDiagnosticsTestBlocker */ SELECT pg_backend_pid() AS pid',
  )
  return rows[0].pid
}

export async function holdPostSeedDiagnosticsLock(
  query: QueryExecutor,
  lockKey: string,
): Promise<void> {
  await query(
    '/* postSeedDiagnosticsTestHold */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [lockKey],
  )
}

/** The exact lock tag PostgreSQL names in its "still waiting" notice for the held lock. */
export async function getPostSeedDiagnosticsLockTag(
  holder: QueryExecutor,
  lockKey: string,
): Promise<string> {
  const { rows } = await holder<{ lock_tag: string }>(
    `/* postSeedDiagnosticsTestLockTag */
    SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
      objid::text || ',' || objsubid::text || ']' AS lock_tag
    FROM pg_locks
    WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND mode = 'ExclusiveLock' AND granted
      AND objsubid = 1
      AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
      AND objid::bigint = (hashtextextended($1, 0) & 4294967295)`,
    [lockKey],
  )
  if (rows.length !== 1) throw new Error('Holder does not own the exact diagnostics lock')
  return rows[0].lock_tag
}

export async function tryPostSeedDiagnosticsLock(
  query: QueryExecutor,
  lockKey: string,
): Promise<boolean> {
  const { rows } = await query<{ acquired: boolean }>(
    '/* postSeedDiagnosticsTestTryLock */ SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
    [lockKey],
  )
  return rows[0].acquired
}

export async function waitForPostSeedDiagnosticsLock(
  query: QueryExecutor,
  lockKey: string,
): Promise<void> {
  await query(
    '/* postSeedDiagnosticsTestBlocked */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [lockKey],
  )
}

export async function rejectPostSeedDiagnosticsOperation(query: QueryExecutor): Promise<void> {
  const failingQuery = rejectQuery(
    query,
    statement => statement.includes('postSeedDiagnosticsTestFailure'),
    'Injected post-seed diagnostics failure',
  )
  await failingQuery('/* postSeedDiagnosticsTestFailure */ SELECT 1')
}
