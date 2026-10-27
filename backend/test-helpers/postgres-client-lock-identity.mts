import type { PoolClient } from '@data-stores/psql'

export type TestPostgresLockIdentity = {
  holderProcessId: number
  lock: { kind: 'advisory'; key: string; namespace?: number } | { kind: 'transaction' }
}
export type TestHeldPostgresLock =
  | { kind: 'advisory'; tag: string }
  | { kind: 'transaction'; transactionId: string }
export type TestOwnedPostgresWaitOptions = TestPostgresLockIdentity & {
  pool: 'advisory' | 'write'
  queryMarker: string
  requestId?: string
  releaseHolder: () => PromiseLike<void>
}

export async function getTestOwnedPostgresLock(
  observer: PoolClient,
  identity: TestPostgresLockIdentity,
): Promise<TestHeldPostgresLock> {
  if (identity.lock.kind === 'advisory')
    return {
      kind: 'advisory',
      tag: await getTestOwnedAdvisoryLockTag(observer, identity.holderProcessId, identity.lock),
    }
  const { rows } = await observer.query<{ transaction_id: string }>(
    `/* getTestOwnedTransactionLock */
      SELECT locks.transactionid::text AS transaction_id
      FROM pg_locks locks JOIN pg_stat_activity activity ON activity.pid = locks.pid
      WHERE locks.pid = $1 AND activity.datname = current_database()
        AND locks.locktype = 'transactionid' AND locks.mode = 'ExclusiveLock' AND locks.granted
      LIMIT 2`,
    [identity.holderProcessId],
  )
  if (rows.length !== 1 || !rows[0])
    throw new Error('Owned holder did not report exactly one granted transaction identity')
  return { kind: 'transaction', transactionId: rows[0].transaction_id }
}

async function getTestOwnedAdvisoryLockTag(
  observer: PoolClient,
  holderProcessId: number,
  lock: { key: string; namespace?: number },
): Promise<string> {
  const { rows } = await observer.query<{ lock_tag: string }>(
    `/* getTestOwnedAdvisoryLockTag */
      SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
        objid::text || ',' || objsubid::text || ']' AS lock_tag
      FROM pg_locks
      WHERE pid = $1 AND locktype = 'advisory' AND granted AND mode = 'ExclusiveLock'
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND (($3::integer IS NULL AND objsubid = 1
          AND classid::bigint = ((hashtextextended($2, 0) >> 32) & 4294967295)
          AND objid::bigint = (hashtextextended($2, 0) & 4294967295))
        OR ($3::integer IS NOT NULL AND objsubid = 2
          AND classid::bigint = ($3::bigint & 4294967295)
          AND objid::bigint = (hashtext($2)::bigint & 4294967295)))
      LIMIT 2`,
    [holderProcessId, lock.key, lock.namespace ?? null],
  )
  if (rows.length !== 1 || !rows[0])
    throw new Error('Owned holder did not report exactly the expected advisory lock')
  return rows[0].lock_tag
}

/** One ownership snapshot, admitted only after the exact native lock-wait notice. */
export async function assertTestOwnedPostgresWait(
  observer: PoolClient,
  waiterProcessId: number,
  holderProcessId: number,
  queryMarker: string,
): Promise<void> {
  const { rows } = await observer.query<{ waiting: boolean }>(
    `/* assertTestOwnedPostgresWait */
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pid = $1 AND datname = current_database()
          AND state = 'active' AND wait_event_type = 'Lock'
          AND position($3 IN query) > 0 AND $2 = ANY(pg_blocking_pids(pid))
      ) AS waiting`,
    [waiterProcessId, holderProcessId, queryMarker],
  )
  if (!rows[0]?.waiting)
    throw new Error('Native lock notice did not match the owned holder and real query')
}
