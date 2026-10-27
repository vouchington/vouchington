import { AsyncLocalStorage } from 'node:async_hooks'
import { syncBuiltinESMExports } from 'node:module'
import timers from 'node:timers/promises'
import { onTestFinished } from 'vitest'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'

const context = new AsyncLocalStorage<object>()
let installed = false

/** Advance only the owned logout operation's promise sleeps; callback timers stay native. */
export async function withLogoutCleanupClock<Result>(
  operation: () => Promise<Result>,
  options: { requestId?: string } = {},
): Promise<Result> {
  if (installed) throw new Error('A logout cleanup clock is already installed')
  if (
    options.requestId !== undefined &&
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(options.requestId)
  )
    throw new Error('A logout cleanup clock requires an owned UUID request id')
  const owner = {}
  const descriptor = Object.getOwnPropertyDescriptor(timers, 'setTimeout')
  if (!descriptor) throw new Error('The public promise timer descriptor is missing')
  let phase: 'open' | 'closing' | 'closed' = 'open'
  let settled: Promise<PromiseSettledResult<Result>> | undefined
  let closing: Promise<void> | undefined
  let cleanupReported = false
  const closedReason = new Error('The owned logout cleanup clock has closed')
  const replacement = new Proxy(timers.setTimeout, {
    apply(original, receiver, args: unknown[]) {
      const owned =
        context.getStore() === owner ||
        (options.requestId !== undefined &&
          getOptionalRequestClientInfo()?.requestId === options.requestId)
      if (phase === 'closed' || !owned || args.length !== 1 || typeof args[0] !== 'number')
        return Reflect.apply(original, receiver, args)
      return phase === 'open' ? Promise.resolve(undefined) : Promise.reject(closedReason)
    },
  })
  async function close(): Promise<void> {
    closing ??= (async () => {
      phase = 'closing'
      try {
        await settled
      } finally {
        try {
          Object.defineProperty(timers, 'setTimeout', descriptor!)
          syncBuiltinESMExports()
        } finally {
          phase = 'closed'
          installed = false
        }
      }
    })()
    try {
      await closing
    } catch (err) {
      if (cleanupReported) return
      cleanupReported = true
      throw err
    }
  }
  onTestFinished(close)
  installed = true
  let result: PromiseSettledResult<Result>
  try {
    Object.defineProperty(timers, 'setTimeout', { ...descriptor, value: replacement })
    syncBuiltinESMExports()
    settled = context
      .run(owner, async () => operation())
      .then(
        value => ({ status: 'fulfilled', value }),
        err => ({ status: 'rejected', reason: err }),
      )
    result = await settled
  } catch (err) {
    result = { status: 'rejected', reason: err }
  }
  try {
    await close()
  } catch (err) {
    if (result.status === 'rejected')
      throw new AggregateError([result.reason, err], 'Logout operation and clock cleanup failed', {
        cause: err,
      })
    throw err
  }
  if (result.status === 'rejected') throw result.reason
  return result.value
}
