import { writePool, type PoolClient } from '@data-stores/psql'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'

export type TestAdvisoryLockIdentity = {
  holderProcessId: number
  key: string
  namespace?: number
}

export type TestOwnedAdvisoryWaitOptions = TestAdvisoryLockIdentity & {
  queryMarker: string
  requestId?: string
  releaseHolder: () => Promise<void>
}

/** Restore a real borrowed client's settings before its synchronous release reaches the pool. */
export function createTestAdvisoryClientLoan(client: PoolClient, lockTag: string) {
  const descriptor = Object.getOwnPropertyDescriptor(client, 'release')
  const release = client.release
  const observation = observeTestAdvisoryLockNotice(client, lockTag)
  const ended = trackTestPostgresClientEnd(client)
  let requested = false
  let finishing: Promise<void> | undefined
  const restoreRelease = () => {
    if (descriptor) Object.defineProperty(client, 'release', descriptor)
    else Reflect.deleteProperty(client, 'release')
  }
  function finish(receiver: PoolClient, args: Parameters<PoolClient['release']>) {
    return (finishing ??= (async () => {
      let restorationFailure: { reason: unknown } | undefined
      try {
        await observation.close()
      } catch (err) {
        restorationFailure = { reason: err }
      }
      restoreRelease()
      if (restorationFailure || args[0]) {
        Reflect.apply(release, receiver, restorationFailure ? [true] : args)
        await ended.promise
      } else {
        ended.close()
        Reflect.apply(release, receiver, args)
      }
      if (restorationFailure) throw restorationFailure.reason
    })())
  }
  Object.defineProperty(client, 'release', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: function (this: PoolClient, ...args: Parameters<PoolClient['release']>) {
      if (requested) throw new Error('Observed advisory client was released more than once')
      requested = true
      void finish(this, args).catch(() => {})
    },
  })
  return {
    ready: observation.ready,
    wait: observation.wait,
    async dispose() {
      if (!requested) {
        requested = true
        await finish(client, [true])
      } else await finishing
    },
  }
}

export function trackTestPostgresClientEnd(client: PoolClient) {
  const ended = Promise.withResolvers<void>()
  const onEnd = () => ended.resolve()
  client.once('end', onEnd)
  return { promise: ended.promise, close: () => client.off('end', onEnd) }
}

export async function discardTestAdvisoryClient(
  client: PoolClient,
  ended = trackTestPostgresClientEnd(client),
): Promise<void> {
  try {
    client.release(true)
    await ended.promise
  } finally {
    ended.close()
  }
}

/** Own the ordinary observer checkout, including a borrow that finishes during cleanup. */
export function reserveTestAdvisoryObserver() {
  let client: PoolClient | undefined
  let ended: ReturnType<typeof trackTestPostgresClientEnd> | undefined
  let released: Promise<void> | undefined
  const ready = writePool.connect().then(actual => {
    client = actual
    ended = trackTestPostgresClientEnd(actual)
    return actual
  })
  void ready.catch(() => {})
  return {
    ready,
    get client() {
      return client
    },
    release(discard: boolean) {
      return (released ??= (async () => {
        await ready.catch(() => undefined)
        if (!client) return
        if (discard) await discardTestAdvisoryClient(client, ended)
        else {
          ended?.close()
          client.release()
        }
      })())
    },
  }
}

export async function getTestOwnedAdvisoryLockTag(
  observer: PoolClient,
  identity: TestAdvisoryLockIdentity,
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
    [identity.holderProcessId, identity.key, identity.namespace ?? null],
  )
  if (rows.length !== 1 || !rows[0])
    throw new Error('Owned holder did not report exactly the expected advisory lock')
  return rows[0].lock_tag
}

/** One ownership snapshot, admitted only after the exact native lock-wait notice. */
export async function assertTestOwnedAdvisoryWait(
  observer: PoolClient,
  waiterProcessId: number,
  holderProcessId: number,
  queryMarker: string,
): Promise<void> {
  const { rows } = await observer.query<{ waiting: boolean }>(
    `/* assertTestOwnedAdvisoryWait */
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pid = $1 AND datname = current_database()
          AND state = 'active' AND wait_event_type = 'Lock'
          AND position($3 IN query) > 0 AND $2 = ANY(pg_blocking_pids(pid))
      ) AS waiting`,
    [waiterProcessId, holderProcessId, queryMarker],
  )
  if (!rows[0]?.waiting)
    throw new Error('Native advisory notice did not match the owned holder and real query')
}
