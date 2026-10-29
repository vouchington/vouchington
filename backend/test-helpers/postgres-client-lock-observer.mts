import { AsyncLocalStorage } from 'node:async_hooks'
import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import {
  createTestPostgresClientLoan,
  reserveTestPostgresObserver,
} from './postgres-client-loan.mts'
import { installTestOwnedPostgresPoolProxy } from './postgres-client-lock-pool-proxy.mts'
import {
  assertTestOwnedPostgresWait,
  getTestOwnedPostgresLock,
  type TestOwnedPostgresWaitOptions,
  type TestHeldPostgresLock,
} from './postgres-client-lock-identity.mts'

const actionScope = new AsyncLocalStorage<object>()

/** Observe every Promise checkout in this action or actual HTTP request until the target wait. */
export async function withTestOwnedPostgresWait<Result>(
  options: TestOwnedPostgresWaitOptions,
  action: (waitForLock: (operation: Promise<unknown>) => Promise<void>) => Promise<Result>,
): Promise<Result> {
  const pool = options.pool === 'write' ? writePool : advisoryLockPool
  const token = {}
  const cancelled = Promise.withResolvers<never>()
  const captured = Promise.withResolvers<ReturnType<typeof createTestPostgresClientLoan>>()
  const operationRegistered = Promise.withResolvers<{
    outcome: Promise<PromiseSettledResult<unknown>[]>
  }>()
  void cancelled.promise.catch(() => {})
  void captured.promise.catch(() => {})
  void operationRegistered.promise.catch(() => {})
  const closedReason = new Error('Owned PostgreSQL observation closed before completion')
  let closed = false
  let entered = false
  let cleanupReported = false
  let observerLoan: ReturnType<typeof reserveTestPostgresObserver> | undefined
  let setup: Promise<TestHeldPostgresLock> | undefined
  const pendingConnects: Promise<PoolClient>[] = []
  const loans: ReturnType<typeof createTestPostgresClientLoan>[] = []
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
    operationRegistered.reject(closedReason)
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
      await Promise.allSettled([observerLoan?.ready, setup, ...pendingConnects, snapshot])
      const disposals = await Promise.allSettled(loans.map(loan => loan.dispose()))
      for (const result of disposals) if (result.status === 'rejected') failures.add(result.reason)
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
          'Owned PostgreSQL action and cleanup failed',
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
    if (operationOutcome) throw new Error('Owned PostgreSQL action was registered more than once')
    operationOutcome = Promise.allSettled([operation])
    operationRegistered.resolve({ outcome: operationOutcome })
    const settledEarly = operationOutcome.then(([result]) => {
      if (result?.status === 'rejected') throw result.reason
      throw new Error('Owned action settled without its native lock wait')
    })
    const observed = await Promise.race([captured.promise, settledEarly, cancelled.promise])
    const observer = observerLoan?.client
    if (closed || !observer) throw closedReason
    const { processId } = await observed.ready
    snapshot = assertTestOwnedPostgresWait(
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
        observerLoan = reserveTestPostgresObserver(options.pool)
        const reservedObserver = await observerLoan.ready
        requireOpen()
        setup = getTestOwnedPostgresLock(reservedObserver, options)
        const targetLock = await setup
        requireOpen()
        restorePool = installTestOwnedPostgresPoolProxy({
          pool,
          actionScope,
          token,
          requestId: options.requestId,
          requireOpen,
          isClosed: () => closed,
          closedReason,
          targetLock,
          operationRegistered: operationRegistered.promise,
          captured,
          pendingConnects,
          loans,
        })
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
