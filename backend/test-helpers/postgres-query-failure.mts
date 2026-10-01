import type pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readPool, writePool } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { runPoolObservationExclusively } from './postgres-pool-observation-queue.mts'

const queryFailureContext = new AsyncLocalStorage<{ active: boolean }>()

/** Fail one actual SQL statement after its owner has begun a real transaction. */
export async function withPostgresQueryFailureForTest<Result>(
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
    const ownsContext = () =>
      context.active &&
      (queryFailureContext.getStore() === context ||
        (options.requestId !== undefined &&
          getOptionalRequestClientInfo()?.requestId === options.requestId))
    let fired = false
    let targetError: Error | undefined
    const restorations = new Set<() => void>()
    const poolDescriptors = [readPool, writePool].map(pool => ({
      pool,
      descriptor: Object.getOwnPropertyDescriptor(pool, 'connect'),
      connect: pool.connect,
    }))

    function requireTargetFailure(result: Result): { result: Result; error: Error } {
      if (!targetError) throw new Error('The operation did not execute the targeted failed SQL')
      return { result, error: targetError }
    }

    function observeClient(client: pg.PoolClient): pg.PoolClient {
      const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const releaseDescriptor = Object.getOwnPropertyDescriptor(client, 'release')
      const originalQuery = client.query
      const originalRelease = client.release
      let began = false
      const restore = () => {
        restoreQueryProperty(client, queryDescriptor)
        restoreProperty(client, 'release', releaseDescriptor)
        restorations.delete(restore)
      }
      restorations.add(restore)
      const query = ((...args: unknown[]) => {
        const text = queryText(args[0])
        const command = text.trimStart().replace(/^\/\*[\s\S]*?\*\/\s*/, '')
        const ownsRequest = ownsContext()
        if (ownsRequest && /^BEGIN\b/.test(command)) began = true
        if (ownsRequest && /^(?:COMMIT|ROLLBACK)\b/.test(command)) began = false
        const target = text.trimStart()
        const matchesCommand =
          !options.command ||
          target.slice(queryMarker.length).trimStart().startsWith(options.command)
        if (!ownsRequest || fired || !target.startsWith(queryMarker) || !matchesCommand)
          return Reflect.apply(originalQuery, client, args)
        const input = args[0]
        if (
          !began ||
          args.length !== 1 ||
          typeof input !== 'object' ||
          input === null ||
          !('text' in input) ||
          typeof input.text !== 'string' ||
          'callback' in input ||
          'submit' in input ||
          Object.getPrototypeOf(input) !== Object.prototype
        )
          throw new Error('Target fault requires the owned transaction adapter Promise query')
        fired = true
        return failActualStatement(args)
      }) as unknown as pg.PoolClient['query']

      async function failActualStatement(args: unknown[]): Promise<unknown> {
        try {
          await (Reflect.apply(originalQuery, client, [
            '/* withPostgresQueryFailureForTest */ SELECT 1 / 0',
          ]) as Promise<unknown>)
          throw new Error('PostgreSQL unexpectedly accepted division by zero')
        } catch (err) {
          if (!(err instanceof Error) || !('code' in err) || err.code !== '22012') throw err
        }
        try {
          return await (Reflect.apply(originalQuery, client, args) as Promise<unknown>)
        } catch (err) {
          if (!(err instanceof Error) || !('code' in err) || err.code !== '25P02') throw err
          targetError = err
          throw err
        }
      }

      installQueryWrapper(client, query)
      Object.defineProperty(client, 'release', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: (...args: unknown[]) => {
          restore()
          return Reflect.apply(originalRelease, client, args)
        },
      })
      return client
    }

    try {
      for (const { pool, connect } of poolDescriptors) {
        const wrappedConnect = ((...args: unknown[]) => {
          // Pool.query uses a callback; preserve that overload and every other context exactly.
          if (args.length || !ownsContext()) return Reflect.apply(connect, pool, args)
          return (Reflect.apply(connect, pool, args) as Promise<pg.PoolClient>).then(client =>
            context.active ? observeClient(client) : client,
          )
        }) as pg.Pool['connect']
        Object.defineProperty(pool, 'connect', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: wrappedConnect,
        })
      }
      return await queryFailureContext.run(context, async () => {
        const result = await operation()
        return requireTargetFailure(result)
      })
    } finally {
      context.active = false
      for (const restore of restorations) restore()
      for (const { pool, descriptor } of poolDescriptors)
        restoreProperty(pool, 'connect', descriptor)
    }
  })
}

function installQueryWrapper(pool: pg.Pool | pg.PoolClient, query: pg.Pool['query']): void {
  Object.defineProperty(pool, 'query', {
    configurable: true,
    enumerable: true,
    value: query,
    writable: true,
  })
}

function restoreQueryProperty(
  pool: pg.Pool | pg.PoolClient,
  descriptor: PropertyDescriptor | undefined,
): void {
  restoreProperty(pool, 'query', descriptor)
}

function restoreProperty(
  object: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(object, key, descriptor)
  else Reflect.deleteProperty(object, key)
}

function queryText(input: unknown): string {
  return typeof input === 'string'
    ? input
    : typeof input === 'object' && input !== null && 'text' in input
      ? String(input.text)
      : ''
}
