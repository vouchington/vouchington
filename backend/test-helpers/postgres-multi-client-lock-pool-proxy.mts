import { AsyncLocalStorage } from 'node:async_hooks'
import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { createTestPostgresClientLoan, discardTestPostgresClient } from './postgres-client-loan.mts'
import type { TestPostgresMultiWaitState } from './postgres-multi-client-lock-types.mts'

/** Route one selected Promise checkout per action and leave unrelated clients untouched. */
export function installTestPostgresMultiWaitPoolProxy(
  states: TestPostgresMultiWaitState[],
  actionScope: AsyncLocalStorage<object>,
  isClosed: () => boolean,
  closedReason: Error,
): () => void {
  const restores: (() => void)[] = []
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    const failures: unknown[] = []
    for (const restorePool of restores.toReversed()) {
      try {
        restorePool()
      } catch (err) {
        failures.push(err)
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Owned PostgreSQL pool proxy restoration failed')
  }
  try {
    for (const pool of [writePool, advisoryLockPool]) {
      restores.push(installPool(pool, states, actionScope, isClosed, closedReason))
    }
  } catch (err) {
    try {
      restore()
    } catch (err_) {
      throw new AggregateError([err, err_], 'Owned PostgreSQL pool proxy setup failed', {
        cause: err_,
      })
    }
    throw err
  }
  return restore
}

function installPool(
  pool: typeof writePool,
  states: TestPostgresMultiWaitState[],
  actionScope: AsyncLocalStorage<object>,
  isClosed: () => boolean,
  closedReason: Error,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
  const original = pool.connect
  const restore = () => {
    if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
    else Reflect.deleteProperty(pool, 'connect')
  }
  const stateForRequest = (requestId: string | undefined) =>
    requestId === undefined
      ? undefined
      : states.find(state => state.options.requestId === requestId)
  try {
    Object.defineProperty(pool, 'connect', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value: new Proxy(original, {
        apply(target, receiver, args) {
          const token = actionScope.getStore()
          const state =
            states.find(candidate => candidate.token === token) ??
            stateForRequest(getOptionalRequestClientInfo()?.requestId)
          const poolName = pool === writePool ? 'write' : 'advisory'
          if (!state || state.options.pool !== poolName || state.claimed)
            return Reflect.apply(target, receiver, args)
          if (isClosed()) throw closedReason
          if (args.some(arg => typeof arg === 'function'))
            throw new Error('Owned first PostgreSQL checkout must use the Promise overload')
          state.claimed = true
          state.pendingConnect = (
            Reflect.apply(target, receiver, args) as Promise<PoolClient>
          ).then(async client => {
            if (isClosed()) {
              await discardTestPostgresClient(client)
              throw closedReason
            }
            state.loan = createTestPostgresClientLoan(client, await state.setup!)
            await state.loan.ready
            if (isClosed()) throw closedReason
            state.captured.resolve(state.loan)
            return client
          })
          void state.pendingConnect.catch(state.captured.reject)
          return state.pendingConnect
        },
      }),
    })
  } catch (err) {
    try {
      restore()
    } catch (err_) {
      throw new AggregateError([err, err_], 'Owned PostgreSQL pool proxy setup failed', {
        cause: err_,
      })
    }
    throw err
  }
  return restore
}
