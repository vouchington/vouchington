import type pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import { once } from 'node:events'
import { readPool, writePool } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { runPoolObservationExclusively } from './postgres-pool-observation-queue.mts'

type PoolLease = { pool: pg.Pool; client: pg.PoolClient; active: boolean; handedOff: boolean }
const leaseContext = new AsyncLocalStorage<PoolLease>()
const failureContext = new AsyncLocalStorage<{ active: boolean }>()

/** Let the unchanged pg.Pool.query core execute its original SQL on an actual aborted client. */
export async function withPostgresPoolQueryFailureForTest<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
  options: { command?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'; requestId?: string } = {},
): Promise<{ result: Result; error: Error }> {
  if (!/^\/\* [^*]+ \*\/$/.test(queryMarker))
    throw new Error('PostgreSQL fault injection requires an exact leading query annotation')
  if (
    options.requestId !== undefined &&
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(options.requestId)
  )
    throw new Error('Request-scoped PostgreSQL faults require an owned UUID request id')
  return runPoolObservationExclusively(async () => {
    const context = { active: true }
    let fired = false
    let targetError: Error | undefined
    let cleanupFailure: Error | undefined
    const originals = [readPool, writePool].map(pool => ({
      pool,
      query: pool.query,
      connect: pool.connect,
      queryDescriptor: Object.getOwnPropertyDescriptor(pool, 'query'),
      connectDescriptor: Object.getOwnPropertyDescriptor(pool, 'connect'),
    }))
    function requireFailure(result: Result): { result: Result; error: Error } {
      if (cleanupFailure) throw cleanupFailure
      if (!targetError) throw new Error('The operation did not execute the targeted failed SQL')
      return { result, error: targetError }
    }

    async function executeFault(
      pool: pg.Pool,
      query: pg.Pool['query'],
      connect: pg.Pool['connect'],
      args: unknown[],
    ): Promise<unknown> {
      const client = await (Reflect.apply(connect, pool, []) as Promise<pg.PoolClient>)
      const lease: PoolLease = { pool, client, active: true, handedOff: false }
      // Register before release: pg-pool destroys errored clients without awaiting their end.
      const ended = once(client, 'end', { signal: AbortSignal.timeout(5_000) })
      // Observe rejection immediately even if SQL fails before cleanup awaits this promise.
      const settledEnd = ended.then(
        () => undefined,
        (err: unknown) => err,
      )
      let result: unknown
      let failure: unknown
      try {
        // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- this test-only lease transfers release to the unchanged pg-pool core; destroying that client owns rollback
        await client.query('BEGIN')
        try {
          await client.query('/* withPostgresPoolQueryFailureForTest */ SELECT 1 / 0')
          throw new Error('PostgreSQL unexpectedly accepted division by zero')
        } catch (err) {
          if (!(err instanceof Error) || !('code' in err) || err.code !== '22012') throw err
        }
        try {
          result = await leaseContext.run(
            lease,
            () => Reflect.apply(query, pool, args) as Promise<unknown>,
          )
        } catch (err) {
          if (!(err instanceof Error) || !('code' in err) || err.code !== '25P02') throw err
          if (!lease.handedOff)
            throw new Error('The original pool core did not acquire the lease', { cause: err })
          targetError = err
          throw err
        }
      } catch (err) {
        failure = err
      } finally {
        lease.active = false
        if (!lease.handedOff) client.release(true)
      }
      const endError = await settledEnd
      if (endError) {
        cleanupFailure = new AggregateError(
          [endError, failure],
          'The failed pool client did not finish closing',
        )
        throw cleanupFailure
      }
      if (failure instanceof Error) throw failure
      if (failure)
        throw new Error('Pool query failed with a non-Error rejection', { cause: failure })
      return result
    }
    function wrapPoolQuery(
      pool: pg.Pool,
      query: pg.Pool['query'],
      connect: pg.Pool['connect'],
    ): pg.Pool['query'] {
      return ((...args: unknown[]) => {
        const input = args[0]
        const text =
          typeof input === 'string'
            ? input
            : typeof input === 'object' && input !== null && 'text' in input
              ? String(input.text)
              : ''
        const target = text.trimStart()
        const matchesCommand =
          !options.command ||
          target.slice(queryMarker.length).trimStart().startsWith(options.command)
        const ownsContext =
          failureContext.getStore() === context ||
          (options.requestId !== undefined &&
            getOptionalRequestClientInfo()?.requestId === options.requestId)
        if (
          !ownsContext ||
          !context.active ||
          fired ||
          !target.startsWith(queryMarker) ||
          !matchesCommand
        )
          return Reflect.apply(query, pool, args)
        if (
          args.length !== 1 ||
          typeof input !== 'object' ||
          input === null ||
          !('text' in input) ||
          typeof input.text !== 'string' ||
          'callback' in input ||
          'submit' in input ||
          Object.getPrototypeOf(input) !== Object.prototype
        )
          throw new Error('Target fault requires the adapter plain-config Promise pool query')
        fired = true
        return executeFault(pool, query, connect, args)
      }) as pg.Pool['query']
    }
    try {
      for (const { pool, query, connect } of originals) {
        const wrappedConnect = ((...args: unknown[]) => {
          const lease = leaseContext.getStore()
          if (
            lease?.active &&
            lease.pool === pool &&
            !lease.handedOff &&
            args.length === 1 &&
            typeof args[0] === 'function'
          ) {
            const callback = args[0] as (
              err: null,
              client: pg.PoolClient,
              release: pg.PoolClient['release'],
            ) => void
            queueMicrotask(() => {
              if (!lease.active) return
              lease.handedOff = true
              callback(null, lease.client, lease.client.release)
            })
            return undefined
          }
          return Reflect.apply(connect, pool, args)
        }) as pg.Pool['connect']
        const wrappedQuery = wrapPoolQuery(pool, query, connect)
        installProperty(pool, 'connect', wrappedConnect)
        installProperty(pool, 'query', wrappedQuery)
      }
      return await failureContext.run(context, async () => requireFailure(await operation()))
    } finally {
      context.active = false
      for (const { pool, queryDescriptor, connectDescriptor } of originals) {
        restoreProperty(pool, 'query', queryDescriptor)
        restoreProperty(pool, 'connect', connectDescriptor)
      }
    }
  })
}

function installProperty(object: object, key: string, value: unknown): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  })
}

function restoreProperty(
  object: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(object, key, descriptor)
  else Reflect.deleteProperty(object, key)
}
