import { onTestFinished, vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  onResponseUsageSettlement,
  type ResponseUsageSettlement,
} from '../api/usage-meter-helpers.mts'

/** Register before owned HTTP work, drain the real close promises, then detach the observer. */
export async function withResponseUsageSettlements<Result>(
  base: string,
  action: () => Promise<Result>,
  { ownedUserIds = [], release }: { ownedUserIds?: readonly string[]; release?: () => void } = {},
): Promise<Result> {
  const receipts: ResponseUsageSettlement[] = []
  const failures: unknown[] = []
  let actionResult: PromiseSettledResult<Result> | undefined
  let actionCompletion: Promise<void> | undefined
  let cleanup: Promise<void> | undefined
  let closed = false
  let unsubscribe: (() => void) | undefined
  onTestFinished(finish)
  unsubscribe = onResponseUsageSettlement(event => {
    const ownsUser = event.ownerUserId !== null && ownedUserIds.includes(event.ownerUserId)
    if (event.pathname.startsWith(`${base}/`) || ownsUser) receipts.push(event)
    return undefined
  })
  try {
    if (closed) throw new Error('Usage observation is already closed')
    actionCompletion = Promise.resolve()
      .then(action)
      .then(
        value => {
          actionResult = { status: 'fulfilled', value }
          return undefined
        },
        err => {
          actionResult = { status: 'rejected', reason: err }
          return undefined
        },
      )
    await actionCompletion
  } finally {
    await finish()
  }
  if (!actionResult) throw new Error('Usage action did not settle')
  if (actionResult.status === 'rejected') return rejectOriginal(actionResult.reason)
  return actionResult.value

  function finish(): Promise<void> {
    closed = true
    cleanup ??= drain()
    return cleanup
  }

  async function drain(): Promise<void> {
    try {
      const releaseFailures: unknown[] = []
      try {
        release?.()
      } catch (err) {
        releaseFailures.push(err)
      }
      await actionCompletion
      if (actionResult?.status === 'rejected') failures.push(actionResult.reason)
      failures.push(...releaseFailures)
      for (const receipt of receipts) {
        const outcome = await receipt.completion
        if (outcome.status === 'rejected') failures.push(outcome.reason)
        failures.push(...receipt.observerErrors)
      }
    } finally {
      unsubscribe?.()
    }
    if (failures.length === 1) return rejectOriginal(failures[0])
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Response usage work failed', { cause: failures[0] })
    }
  }
}

function rejectOriginal(failureReason: unknown): Promise<never> {
  const failure = Promise.withResolvers<never>()
  failure.reject(failureReason)
  return failure.promise
}

/** Hold only this owner's real charge completion; unrelated calls delegate unchanged. */
export function holdOwnedResponseUsageCharge(userId: string) {
  const original = RateLimiter.prototype.add
  if (vi.isMockFunction(original)) throw new Error('RateLimiter.add already has an observer')
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const operations: Promise<PromiseSettledResult<void>>[] = []
  let restore = () => {}
  let cleanup: Promise<void> | undefined
  onTestFinished(finish)
  const spy = vi.spyOn(RateLimiter.prototype, 'add')
  restore = () => spy.mockRestore()
  spy.mockImplementation(function (this: RateLimiter, ids: string[]) {
    const operation = original.call(this, ids)
    if (!ids.includes(`rest_user:user:${userId}`)) return operation
    const settled = operation.then<PromiseSettledResult<void>, PromiseSettledResult<void>>(
      () => ({ status: 'fulfilled', value: undefined }),
      err => ({ status: 'rejected', reason: err }),
    )
    const completion = Promise.all([settled, released.promise]).then(([outcome]) => {
      if (outcome.status === 'rejected') return rejectOriginal(outcome.reason)
      return undefined
    })
    operations.push(
      completion.then<PromiseSettledResult<void>, PromiseSettledResult<void>>(
        () => ({ status: 'fulfilled', value: undefined }),
        err => ({ status: 'rejected', reason: err }),
      ),
    )
    entered.resolve()
    return completion
  })
  return { entered: entered.promise, release: () => released.resolve() }

  function finish(): Promise<void> {
    released.resolve()
    cleanup ??= (async () => {
      const failures: unknown[] = []
      try {
        for (const operation of operations) {
          const outcome = await operation
          if (outcome.status === 'rejected') failures.push(outcome.reason)
        }
      } finally {
        try {
          restore()
        } catch (err) {
          failures.push(err)
        }
      }
      if (failures.length === 1) return rejectOriginal(failures[0])
      if (failures.length > 1)
        throw new AggregateError(failures, 'Owned usage charge failed', { cause: failures[0] })
    })()
    return cleanup
  }
}
