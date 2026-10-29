import { AsyncLocalStorage } from 'node:async_hooks'
import { onTestFinished } from 'vitest'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { reserveTestPostgresObserver } from './postgres-client-loan.mts'
import {
  assertTestOwnedPostgresWait,
  getTestOwnedPostgresLock,
  type TestOwnedPostgresWaitOptions,
} from './postgres-client-lock-identity.mts'
import { cleanupTestPostgresMultiWait } from './postgres-multi-client-lock-cleanup.mts'
import { installTestPostgresMultiWaitPoolProxy } from './postgres-multi-client-lock-pool-proxy.mts'
import type {
  TestPostgresClientLoan,
  TestPostgresMultiWaitState,
} from './postgres-multi-client-lock-types.mts'

export type TestPostgresMultiWaitAction<Result> = {
  operation: Promise<Result>
  waitForLock(): Promise<void>
  waiterProcessId(): Promise<number>
}

/** Hold the process-wide pool observation lease while witnessing multiple real lock waits. */
export async function createTestPostgresMultiWait() {
  const states: TestPostgresMultiWaitState[] = []
  const actionScope = new AsyncLocalStorage<object>()
  const entered = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<void>()
  const closedReason = new Error('Owned PostgreSQL observation closed before completion')
  let closed = false
  let restorePool: (() => void) | undefined
  let cleanupPromise: Promise<void> | undefined
  let cleanupReported = false
  let primary: unknown

  const exclusive = runPoolObservationExclusively(async () => {
    try {
      restorePool = installTestPostgresMultiWaitPoolProxy(
        states,
        actionScope,
        () => closed,
        closedReason,
      )
      entered.resolve()
      await finished.promise
    } finally {
      restorePool?.()
    }
  })
  void exclusive.catch(err => {
    primary ??= err
    entered.reject(err)
  })
  await entered.promise

  function releaseHolder(state: TestPostgresMultiWaitState) {
    return (state.holderRelease ??= Promise.resolve().then(state.options.releaseHolder))
  }

  async function waitForLock(state: TestPostgresMultiWaitState) {
    try {
      if (state.witnessed)
        throw new Error('Owned PostgreSQL lock witness was requested more than once')
      const settledEarly = state.operation!.then(
        () => {
          throw new Error('Owned action settled without its native lock wait')
        },
        err => {
          throw err
        },
      )
      const loan = await Promise.race([
        state.captured.promise,
        settledEarly,
        state.cancelled.promise,
      ])
      await Promise.race([
        loan.wait(Promise.allSettled([state.operation!])),
        state.cancelled.promise,
      ])
      const observer = state.observerLoan?.client
      if (closed || !observer) throw closedReason
      const { processId } = await loan.ready
      state.snapshot = assertTestOwnedPostgresWait(
        observer,
        processId,
        state.options.holderProcessId,
        state.options.queryMarker,
      )
      await state.snapshot
      state.witnessed = true
    } catch (err) {
      primary ??= err
      throw err
    }
  }

  async function cleanup() {
    if (cleanupPromise) return cleanupPromise
    closed = true
    for (const state of states) {
      state.cancelled.reject(closedReason)
      state.captured.reject(closedReason)
    }
    cleanupPromise = cleanupTestPostgresMultiWait({
      states,
      releaseHolder,
      restorePool: () => restorePool?.(),
      hasPrimaryFailure: () => primary !== undefined,
      primaryFailure: () => primary,
      closedReason,
    })
    return cleanupPromise
  }

  const owner = {
    start<Result>(
      options: TestOwnedPostgresWaitOptions,
      action: () => Promise<Result>,
    ): Promise<TestPostgresMultiWaitAction<Result>> {
      if (closed) throw closedReason
      const cancelled = Promise.withResolvers<never>()
      const captured = Promise.withResolvers<TestPostgresClientLoan>()
      const operation = Promise.withResolvers<Result>()
      void cancelled.promise.catch(() => {})
      void captured.promise.catch(() => {})
      void operation.promise.catch(() => {})
      const state: TestPostgresMultiWaitState = {
        token: {},
        options,
        started: Promise.resolve(),
        witnessed: false,
        cancelled,
        captured,
        operation: operation.promise,
      }
      states.push(state)
      state.started = (async () => {
        try {
          state.observerLoan = reserveTestPostgresObserver(options.pool)
          state.setup = state.observerLoan.ready.then(observer => {
            if (closed) throw closedReason
            return getTestOwnedPostgresLock(observer, options)
          })
          await state.setup
          if (closed) throw closedReason
          const actionOutcome = Promise.resolve().then(() => actionScope.run(state.token, action))
          void actionOutcome.then(operation.resolve, operation.reject)
        } catch (err) {
          primary ??= err
          state.captured.reject(err)
          operation.reject(err)
          throw err
        }
      })()
      void state.started.catch(() => {})
      return Promise.resolve({
        operation: operation.promise,
        waitForLock: () => waitForLock(state),
        waiterProcessId: async () => {
          const loan = await state.captured.promise
          return (await loan.ready).processId
        },
      })
    },
    async [Symbol.asyncDispose]() {
      try {
        await cleanup()
      } finally {
        cleanupReported = true
        finished.resolve()
        await exclusive
      }
    },
  }
  onTestFinished(() => (cleanupReported ? undefined : owner[Symbol.asyncDispose]()))
  return owner
}
