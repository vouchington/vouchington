import type pg from 'pg'
import { onTestFinished } from 'vitest'
import sql from 'sql-template-strings'
import { beginTransaction, writePool } from '@data-stores/psql'
import { getActivityPubInboxTestRequestId } from './api/request-query-profile.mts'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Hold the real counter row while observing the owned HTTP INSERT's unchanged native promise. */
export function withActivityPubInboxHttpLockRace<Result>(
  requestId: string,
  run: (control: {
    insertInvoked: Promise<void>
    returnedId: Promise<string>
    releaseCounter(): Promise<void>
    canAcquireExclusiveAdmission(): Promise<boolean>
  }) => Promise<Result>,
): Promise<Result> {
  const invoked = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<string>()
  void invoked.promise.catch(() => undefined)
  void returned.promise.catch(() => undefined)
  let close: (() => Promise<void>) | undefined
  let finished = false
  onTestFinished(async () => {
    finished = true
    await close?.()
  })
  return runPoolObservationExclusively(async () => {
    if (finished) throw new Error('HTTP lock race closed before observation admission')
    const original = writePool.query
    const descriptor = Object.getOwnPropertyDescriptor(writePool, 'query')
    const transactionPromise = beginTransaction()
    const startup = transactionPromise.then(async transaction => {
      const held = await transaction(sql`/* activityPubInboxHttpLockRace.counter */
        SELECT is_singleton FROM activitypub_inbox_delivery_storage_counters
        WHERE is_singleton FOR UPDATE
      `)
      if (held.rowCount !== 1) throw new Error('ActivityPub storage counter singleton is missing')
      return transaction
    })
    void startup.catch(() => undefined)
    let releasePromise: Promise<void> | undefined
    let closePromise: Promise<void> | undefined
    let active = true
    const nativeWork: Promise<unknown>[] = []
    function releaseCounter(): Promise<void> {
      releasePromise ??= (async () => {
        const transaction = await transactionPromise
        let startupFailure: unknown
        let failed = false
        try {
          await startup
        } catch (err) {
          failed = true
          startupFailure = err
        }
        try {
          await transaction[Symbol.asyncDispose]()
        } catch (err) {
          if (failed)
            throw new AggregateError([startupFailure, err], 'Counter startup and rollback failed', {
              cause: err,
            })
          throw err
        }
        if (failed) throw startupFailure
      })()
      return releasePromise
    }
    close = () => {
      closePromise ??= (async () => {
        active = false
        const failures: unknown[] = []
        try {
          await releaseCounter()
        } catch (err) {
          failures.push(err)
        }
        const results = await Promise.allSettled(nativeWork)
        for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
        if (descriptor) Object.defineProperty(writePool, 'query', descriptor)
        else Reflect.deleteProperty(writePool, 'query')
        invoked.reject(new Error('HTTP INSERT observation closed'))
        returned.reject(new Error('HTTP INSERT observation closed'))
        if (failures.length) throw new AggregateError(failures, 'HTTP lock race cleanup failed')
      })()
      return closePromise
    }
    writePool.query = ((...args: unknown[]) => {
      const input = args[0]
      const text =
        typeof input === 'object' && input !== null && 'text' in input ? String(input.text) : ''
      const target =
        active &&
        text.trimStart().startsWith('/* acceptActivityPubInboxDelivery */') &&
        getActivityPubInboxTestRequestId() === requestId
      const actual: unknown = Reflect.apply(original, writePool, args)
      if (target) {
        const pending = Promise.resolve(actual).then(result => {
          if (
            typeof result !== 'object' ||
            result === null ||
            !('rows' in result) ||
            !Array.isArray(result.rows) ||
            typeof result.rows[0]?.id !== 'string'
          ) {
            throw new Error('Owned HTTP INSERT did not return its durable identity')
          }
          returned.resolve(result.rows[0].id)
          return undefined
        })
        nativeWork.push(pending)
        void pending.catch(err => returned.reject(err))
        invoked.resolve()
      }
      return actual
    }) as pg.Pool['query']
    try {
      await startup
      const result = await run({
        insertInvoked: invoked.promise,
        returnedId: returned.promise,
        releaseCounter,
        async canAcquireExclusiveAdmission() {
          // The counter client and owner's admission client are both leased, so this is a distinct backend.
          const probe = await writePool.connect()
          try {
            const { rows } = await probe.query<{ acquired: boolean }>(
              "/* activityPubInboxHttpLockRace.admission */ SELECT pg_try_advisory_lock(hashtextextended('activitypub-inbox-test-admission', 0)) AS acquired",
            )
            const acquired = rows[0]?.acquired
            if (acquired)
              await probe.query(
                "SELECT pg_advisory_unlock(hashtextextended('activitypub-inbox-test-admission', 0))",
              )
            return acquired
          } finally {
            probe.release()
          }
        },
      })
      await close()
      return result
    } catch (err) {
      const primary = err
      try {
        await close()
      } catch (err) {
        if (err === primary) throw err
        throw new AggregateError([primary, err], 'HTTP lock race body and cleanup failed', {
          cause: err,
        })
      }
      throw primary
    }
  })
}
