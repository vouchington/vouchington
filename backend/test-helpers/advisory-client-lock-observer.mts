import { AsyncLocalStorage } from 'node:async_hooks'
import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { onTestFinished } from 'vitest'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import {
  assertTestOwnedAdvisoryWait,
  createTestAdvisoryClientLoan,
  discardTestAdvisoryClient,
  getTestOwnedAdvisoryLockTag,
  reserveTestAdvisoryObserver,
  type TestOwnedAdvisoryWaitOptions,
} from './advisory-client-loan.mts'

const actionScope = new AsyncLocalStorage<object>()

/** Own only the first selected pool's Promise checkout of this action or actual HTTP request. */
export async function withTestOwnedAdvisoryWait<Result>(
  options: TestOwnedAdvisoryWaitOptions,
  action: (waitForLock: (operation: Promise<unknown>) => Promise<void>) => Promise<Result>,
): Promise<Result> {
  const pool = options.pool === 'write' ? writePool : advisoryLockPool
  const token = {}
  const cancelled = Promise.withResolvers<never>()
  const captured = Promise.withResolvers<ReturnType<typeof createTestAdvisoryClientLoan>>()
  void cancelled.promise.catch(() => {})
  void captured.promise.catch(() => {})
  const closedReason = new Error('Owned advisory observation closed before completion')
  let closed = false
  let entered = false
  let cleanupReported = false
  let observerLoan: ReturnType<typeof reserveTestAdvisoryObserver> | undefined
  let setup: Promise<string> | undefined
  let pendingConnect: Promise<PoolClient> | undefined
  let loan: ReturnType<typeof createTestAdvisoryClientLoan> | undefined
  let operationOutcome: Promise<PromiseSettledResult<unknown>[]> | undefined
  let callbackOutcome: Promise<PromiseSettledResult<Result>[]> | undefined
  let snapshot: Promise<void> | undefined
  let restorePool: (() => void) | undefined
  let holderRelease: Promise<void> | undefined
  let cleaning: Promise<void> | undefined
  let primary: { reason: unknown } | undefined
  let witnessed = false
  function requireOpen() {
    if (closed) throw closedReason
  }
  const releaseHolder = () => (holderRelease ??= Promise.resolve().then(options.releaseHolder))
  const cleanup = () => {
    closed = true
    cancelled.reject(closedReason)
    captured.reject(closedReason)
    return (cleaning ??= (async () => {
      const failures = new Set<unknown>()
      try {
        await releaseHolder()
      } catch (err) {
        failures.add(err)
      }
      const callbackResults = (await callbackOutcome) ?? []
      const operationResults = (await operationOutcome) ?? []
      for (const result of callbackResults)
        if (result.status === 'rejected' && result.reason !== closedReason)
          failures.add(result.reason)
      await Promise.allSettled([observerLoan?.ready, setup, pendingConnect, snapshot])
      try {
        await loan?.dispose()
      } catch (err) {
        failures.add(err)
      }
      try {
        restorePool?.()
      } catch (err) {
        failures.add(err)
      }
      try {
        await observerLoan?.release(Boolean(primary || failures.size))
      } catch (err) {
        failures.add(err)
      }
      if (primary || failures.size)
        for (const result of operationResults)
          if (result.status === 'rejected' && result.reason !== closedReason)
            failures.add(result.reason)
      if (primary) failures.delete(primary.reason)
      if (failures.size)
        throw new AggregateError(
          [...(primary ? [primary.reason] : []), ...failures],
          'Owned advisory action and cleanup failed',
          { cause: failures.values().next().value },
        )
    })())
  }
  const dispose = async () => {
    try {
      await cleanup()
    } finally {
      cleanupReported = true
    }
  }
  onTestFinished(() => (cleanupReported ? undefined : dispose()))
  async function waitForLock(operation: Promise<unknown>): Promise<void> {
    if (operationOutcome) throw new Error('Owned advisory action was registered more than once')
    operationOutcome = Promise.allSettled([operation])
    const settledEarly = operationOutcome.then(([result]) => {
      if (result?.status === 'rejected') throw result.reason
      throw new Error('Owned action settled without its native advisory wait')
    })
    const observed = await Promise.race([captured.promise, settledEarly, cancelled.promise])
    await Promise.race([observed.wait(operationOutcome), cancelled.promise])
    const observer = observerLoan?.client
    if (closed || !observer) throw closedReason
    const { processId } = await observed.ready
    snapshot = assertTestOwnedAdvisoryWait(
      observer,
      processId,
      options.holderProcessId,
      options.queryMarker,
    )
    await snapshot
    witnessed = true
  }
  try {
    return await runPoolObservationExclusively(async () => {
      entered = true
      try {
        requireOpen()
        observerLoan = reserveTestAdvisoryObserver(options.pool)
        const reservedObserver = await observerLoan.ready
        requireOpen()
        setup = getTestOwnedAdvisoryLockTag(reservedObserver, options)
        const tag = await setup
        requireOpen()
        const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
        const original = pool.connect
        let claimed = false
        Object.defineProperty(pool, 'connect', {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          writable: true,
          value: new Proxy(original, {
            apply(target, receiver, args) {
              const owned =
                actionScope.getStore() === token ||
                (options.requestId !== undefined &&
                  getOptionalRequestClientInfo()?.requestId === options.requestId)
              if (!owned || claimed) return Reflect.apply(target, receiver, args)
              requireOpen()
              claimed = true
              if (args.some(arg => typeof arg === 'function'))
                throw new Error('Owned first advisory checkout must use the Promise overload')
              pendingConnect = (Reflect.apply(target, receiver, args) as Promise<PoolClient>).then(
                async client => {
                  if (closed) {
                    await discardTestAdvisoryClient(client)
                    throw closedReason
                  }
                  loan = createTestAdvisoryClientLoan(client, tag)
                  await loan.ready
                  requireOpen()
                  captured.resolve(loan)
                  return client
                },
              )
              void pendingConnect.catch(captured.reject)
              return pendingConnect
            },
          }),
        })
        restorePool = () => {
          if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
          else Reflect.deleteProperty(pool, 'connect')
        }
        callbackOutcome = Promise.allSettled([
          Promise.resolve().then(() => actionScope.run(token, () => action(waitForLock))),
        ])
        const [result] = await callbackOutcome
        if (result?.status === 'rejected') throw result.reason
        if (!result || !witnessed) throw new Error('Owned action omitted its native lock witness')
        return result.value
      } catch (err) {
        primary = { reason: err }
        throw err
      } finally {
        await dispose()
      }
    })
  } catch (err) {
    primary ??= { reason: err }
    throw err
  } finally {
    if (!entered) {
      await dispose()
    }
  }
}
