import { AsyncLocalStorage } from 'node:async_hooks'
import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { createTestPostgresClientLoan, discardTestPostgresClient } from './postgres-client-loan.mts'
import type { TestPostgresMultiWaitState } from './postgres-multi-client-lock-types.mts'

/** Route one selected checkout per action and leave unrelated clients untouched. */
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
  const prepareLoan = async (
    client: PoolClient,
    state: TestPostgresMultiWaitState,
  ): Promise<PoolClient> => {
    if (isClosed()) {
      await discardTestPostgresClient(client)
      throw closedReason
    }
    let loan: ReturnType<typeof createTestPostgresClientLoan> | undefined
    try {
      loan = createTestPostgresClientLoan(client, await state.setup!)
      state.loan = loan
      await loan.ready
      if (isClosed()) throw closedReason
      state.captured.resolve(loan)
      return client
    } catch (err) {
      try {
        if (loan) await loan.dispose()
        else await discardTestPostgresClient(client)
      } catch (cleanupErr) {
        throw new AggregateError([err, cleanupErr], 'Owned PostgreSQL loan setup failed', {
          cause: cleanupErr,
        })
      }
      throw err
    }
  }
  async function completeCallbackLoan(
    client: PoolClient,
    state: TestPostgresMultiWaitState,
    callback: (err?: Error, client?: PoolClient, release?: PoolClient['release']) => void,
  ) {
    let readyClient: PoolClient
    try {
      state.pendingConnect = prepareLoan(client, state)
      readyClient = await state.pendingConnect
    } catch (err) {
      state.captured.reject(err)
      try {
        callback(err as Error)
      } catch (callbackErr) {
        state.captured.reject(callbackErr)
      }
      return
    }
    try {
      callback(undefined, readyClient, readyClient.release)
    } catch (err) {
      state.captured.reject(err)
    }
  }
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
          state.claimed = true
          if (typeof args[0] === 'function') {
            const callback = args[0] as (
              err?: Error,
              client?: PoolClient,
              release?: PoolClient['release'],
            ) => void
            return Reflect.apply(target, receiver, [
              (err?: Error, client?: PoolClient, release?: PoolClient['release']) => {
                if (err || !client) {
                  if (err) state.captured.reject(err)
                  return callback(err, client, release)
                }
                void completeCallbackLoan(client, state, callback)
              },
            ])
          }
          state.pendingConnect = (
            Reflect.apply(target, receiver, args) as Promise<PoolClient>
          ).then(client => prepareLoan(client, state))
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
