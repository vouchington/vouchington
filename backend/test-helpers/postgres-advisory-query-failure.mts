import { AsyncLocalStorage } from 'node:async_hooks'
import { once } from 'node:events'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'
import { runPoolObservationExclusively } from './postgres-pool-observation-queue.mts'

const failureContext = new AsyncLocalStorage<{ active: boolean }>()

/** Fail one original statement on a real, owned advisory-lock session. */
export async function withPostgresAdvisoryLockQueryFailureForTest<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
): Promise<{ result: Result; error: Error }> {
  if (!/^\/\* [^*]+ \*\/$/.test(queryMarker))
    throw new Error('Advisory faults require an exact leading query annotation')
  return runPoolObservationExclusively(async () => {
    const context = { active: true }
    const connectDescriptor = Object.getOwnPropertyDescriptor(advisoryLockPool, 'connect')
    const originalConnect = advisoryLockPool.connect
    const restorations = new Set<() => void>()
    let fired = false
    let targetError: Error | undefined
    let clientEnd: Promise<unknown> | undefined
    let endError: unknown
    let result: Result | undefined
    let operationFailed = false
    let operationError: unknown

    function observeClient(client: PoolClient): PoolClient {
      const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const releaseDescriptor = Object.getOwnPropertyDescriptor(client, 'release')
      const originalQuery = client.query
      const originalRelease = client.release
      const restore = () => {
        restoreProperty(client, 'query', queryDescriptor)
        restoreProperty(client, 'release', releaseDescriptor)
        restorations.delete(restore)
      }
      restorations.add(restore)
      const query = ((...args: unknown[]) => {
        if (
          !context.active ||
          failureContext.getStore() !== context ||
          fired ||
          typeof args[0] !== 'string' ||
          !args[0].trimStart().startsWith(queryMarker)
        )
          return Reflect.apply(originalQuery, client, args)
        if (args.length !== 2 || !Array.isArray(args[1]))
          throw new Error('Advisory target requires the original string-and-values Promise query')
        fired = true
        clientEnd = once(client, 'end', { signal: AbortSignal.timeout(5_000) }).catch(err => {
          endError = err
        })
        return failActualStatement(args)
      }) as PoolClient['query']

      async function failActualStatement(args: unknown[]): Promise<unknown> {
        // The service owns this session's release(true); a transaction resource would double-own it.
        await (Reflect.apply(originalQuery, client, ['BEGIN']) as Promise<unknown>)
        try {
          await (Reflect.apply(originalQuery, client, [
            '/* withPostgresAdvisoryLockQueryFailureForTest */ SELECT 1 / 0',
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

      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
      Object.defineProperty(client, 'release', {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => {
          restore()
          return Reflect.apply(originalRelease, client, args)
        },
      })
      return client
    }

    try {
      const connect = ((...args: unknown[]) => {
        if (args.length || !context.active || failureContext.getStore() !== context)
          return Reflect.apply(originalConnect, advisoryLockPool, args)
        return (Reflect.apply(originalConnect, advisoryLockPool, args) as Promise<PoolClient>).then(
          client => (context.active ? observeClient(client) : client),
        )
      }) as typeof originalConnect
      Object.defineProperty(advisoryLockPool, 'connect', {
        configurable: true,
        writable: true,
        value: connect,
      })
      result = await failureContext.run(context, operation)
    } catch (err) {
      operationFailed = true
      operationError = err
    } finally {
      context.active = false
      for (const restore of restorations) restore()
      restoreProperty(advisoryLockPool, 'connect', connectDescriptor)
      if (clientEnd) await clientEnd
    }
    if (endError)
      throw new AggregateError(
        [endError, ...(operationFailed ? [operationError] : targetError ? [targetError] : [])],
        'The owned advisory client did not close',
      )
    if (operationFailed) throw operationError
    if (!targetError) throw new Error('The operation did not execute the targeted failed SQL')
    return { result: result as Result, error: targetError }
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
