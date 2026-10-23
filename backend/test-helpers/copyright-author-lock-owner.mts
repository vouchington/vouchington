import { onTestFinished } from 'vitest'
import {
  beginTransaction,
  writePool,
  type PoolClient,
  type OwnedTransaction,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'

type Connection = { client: PoolClient }
type Observation = ReturnType<typeof observeTestAdvisoryLockNotice>

/** Reserve each owned connection before holding the author lock; release before joining actions. */
export async function withTestCopyrightAuthorLock<T>(
  accountId: string,
  count: number,
  body: (owner: {
    start<Result>(
      index: number,
      action: (connection: Connection) => Promise<Result>,
    ): {
      settled: Promise<PromiseSettledResult<Result>[]>
      wait(): Promise<void>
    }
    release(): Promise<void>
  }) => Promise<T>,
): Promise<T> {
  if (count !== 1 && count !== 2) throw new Error('Copyright contention owns one or two contenders')
  const used = new Set<number>()
  const clients: PoolClient[] = []
  const observers: Observation[] = []
  const actions: Promise<PromiseSettledResult<unknown>[]>[] = []
  const errors: unknown[] = []
  let identity: { holder_pid: number; lock_tag: string } | undefined
  let sessions: Awaited<Observation['ready']>[] = []
  let holder: OwnedTransaction | undefined
  let released: Promise<void> | undefined
  let prepared: Promise<void> | undefined
  let bodySettlement: Promise<PromiseSettledResult<T>[]> | undefined
  let closing: Promise<void> | undefined
  let closed = false
  let reported = false
  const assertOpen = () => {
    if (closed) throw new Error('Owned copyright lock scope is closing')
  }
  const release = () => (released ??= holder ? holder.commit() : Promise.resolve())
  const takeErrors = () => {
    if (reported) return []
    reported = true
    return [...errors]
  }
  const attempt = async (run: () => unknown) => {
    try {
      await run()
    } catch (err) {
      errors.push(err)
    }
  }
  const finish = () =>
    (closing ??= (async () => {
      closed = true
      if (prepared) await Promise.allSettled([prepared])
      if (released) await attempt(() => released)
      else if (holder) await attempt(() => holder!.rollback())
      if (bodySettlement) await bodySettlement
      for (const action of actions) await action
      for (let index = clients.length - 1; index >= 0; index--) {
        let destroy = false
        try {
          await observers[index]?.close()
        } catch (err) {
          errors.push(err)
          destroy = true
        }
        await attempt(() => clients[index]!.release(destroy))
      }
      if (holder) await attempt(() => holder![Symbol.asyncDispose]())
    })())
  onTestFinished(async () => {
    await finish()
    const failures = takeErrors()
    if (failures.length)
      throw new AggregateError(failures, 'Copyright author-lock cleanup failed', {
        cause: failures[0],
      })
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    prepared = (async () => {
      for (let index = 0; index < count; index++) {
        assertOpen()
        clients.push(await writePool.connect())
      }
      assertOpen()
      holder = await beginTransaction()
      assertOpen()
      const key = `author:${accountId.toLowerCase()}`
      await holder(sql`/* copyrightAuthorLockOwner.hold */
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
      const { rows } = await holder<{ holder_pid: number; lock_tag: string }>(sql`
        /* copyrightAuthorLockOwner.identity */
        SELECT pg_backend_pid()::integer AS holder_pid,
          'advisory lock [' || database::text || ',' || classid::text || ',' ||
          objid::text || ',' || objsubid::text || ']' AS lock_tag
        FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted
          AND classid::bigint = ((hashtextextended(${key}, 0) >> 32) & 4294967295)
          AND objid::bigint = (hashtextextended(${key}, 0) & 4294967295) AND objsubid = 1
      `)
      identity = rows[0]
      if (!identity || rows.length !== 1)
        throw new Error('Missing exact owned author advisory lock')
      assertOpen()
      for (const client of clients)
        observers.push(observeTestAdvisoryLockNotice(client, identity.lock_tag))
      sessions = await Promise.all(observers.map(observer => observer.ready))
    })()
    await prepared
    assertOpen()
    const lockIdentity = identity
    if (!lockIdentity) throw new Error('Missing owned lock identity')
    const operation = body({
      release,
      start(index, action) {
        assertOpen()
        const client = clients[index]
        const observer = observers[index]
        const session = sessions[index]
        if (!client || !observer || !session || used.has(index))
          throw new Error('Unknown or already started owned contender index')
        used.add(index)
        const promise = Promise.resolve().then(() => {
          assertOpen()
          return action({ client })
        })
        const settled = Promise.allSettled([promise])
        actions.push(settled)
        return {
          settled,
          async wait() {
            await observer.wait(settled)
            // PostgreSQL logs the notice outside the latch wait, so wait_event_type is briefly
            // empty after delivery. The ungranted lock entry stays queued and proves the wait.
            await holder!(sql`/* copyrightAuthorLockOwner.clearActivitySnapshot */
                SELECT pg_stat_clear_snapshot()`)
            const { rows: proof } = await holder!<{ waiting: boolean }>(sql`
                /* copyrightAuthorLockOwner.validateNotice */
                SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                  WHERE pid = ${session.processId} AND application_name = ${session.applicationName}
                    AND state = 'active'
                    AND query LIKE '%lockPostPublicationScope%'
                    AND EXISTS (SELECT 1 FROM pg_locks queued
                      WHERE queued.pid = pg_stat_activity.pid AND queued.locktype = 'advisory'
                        AND NOT queued.granted
                        AND 'advisory lock [' || queued.database::text || ',' ||
                          queued.classid::text || ',' || queued.objid::text || ',' ||
                          queued.objsubid::text || ']' = ${lockIdentity.lock_tag})
                    AND ${lockIdentity.holder_pid} = ANY(pg_blocking_pids(pid))) AS waiting
              `)
            if (!proof[0]?.waiting) throw new Error('Owned notice did not retain its exact blocker')
          },
        }
      },
    })
    bodySettlement = Promise.allSettled([operation])
    result = await operation
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  const failures = takeErrors()
  if (failures.length)
    return Promise.reject(
      new AggregateError(failures, 'Copyright lock scope or cleanup failed', {
        cause: failed ? primary : failures[0],
      }),
    )
  if (failed) {
    const failure = Promise.withResolvers<never>()
    failure.reject(primary)
    return failure.promise
  }
  return result!
}
