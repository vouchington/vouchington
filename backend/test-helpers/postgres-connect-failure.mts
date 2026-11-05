import { AsyncLocalStorage } from 'node:async_hooks'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

const connectionFaultContext = new AsyncLocalStorage<symbol>()

/** Fail one owned operation's promise checkout on the real write pool, preserving other callers. */
export async function withNextPostgresConnectFailure<Result>(
  error: Error,
  operation: () => Promise<Result>,
): Promise<Result> {
  return runPoolObservationExclusively(async () => {
    const token = Symbol('postgres-connect-failure')
    const descriptor = Object.getOwnPropertyDescriptor(writePool, 'connect')
    const connect = writePool.connect
    let fired = false
    let active = true
    const wrapped = new Proxy(connect, {
      apply(target, receiver, args) {
        if (
          !active ||
          receiver !== writePool ||
          args.length !== 0 ||
          connectionFaultContext.getStore() !== token ||
          fired
        )
          return Reflect.apply(target, receiver, args)
        fired = true
        return Promise.reject(error)
      },
    })
    Object.defineProperty(writePool, 'connect', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: wrapped,
    })
    try {
      const result = await connectionFaultContext.run(token, operation)
      if (!fired)
        throw new Error('The operation did not acquire the targeted write-pool connection')
      return result
    } finally {
      active = false
      if (descriptor) Object.defineProperty(writePool, 'connect', descriptor)
      else Reflect.deleteProperty(writePool, 'connect')
    }
  })
}
