import { afterEach, describe, expect, it, vi } from 'vitest'
import { gracefulShutdownPeriodSeconds } from '@voucha/config'
import { shutdownDataStoresForOneOffCommand } from './index.mts'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Capture only the force-exit timer instead of installing process-wide fake timers: the fork's
 * live GlideMQ worker schedules its wakes with `setTimeout`, and faking or clearing them strands
 * an in-flight background job, which fails the fork-leak settle hook of whichever test runs next.
 * Every other timer still reaches the real `setTimeout`.
 */
function captureForceExitTimer() {
  const realSetTimeout = globalThis.setTimeout
  const unref = vi.fn<() => void>()
  let fire: () => void = () => {
    throw new Error('The force-exit timer was never scheduled')
  }
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    if (delay !== gracefulShutdownPeriodSeconds * 1000) {
      return Reflect.apply(realSetTimeout, globalThis, [callback, delay, ...args])
    }
    fire = callback
    return { unref }
  }) as unknown as typeof setTimeout)
  return { unref, fire: () => fire() }
}

describe('one-off data-store shutdown', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('propagates cleanup failures after attempting every data store', async () => {
    captureForceExitTimer()
    const valkeyError = new Error('valkey close failed')
    const psqlError = new Error('psql close failed')
    const onGracefulShutdownValkey = vi.fn<() => Promise<void>>().mockRejectedValue(valkeyError)
    const onGracefulShutdownPSQL = vi.fn<() => Promise<void>>().mockRejectedValue(psqlError)

    await expect(
      shutdownDataStoresForOneOffCommand({
        onGracefulShutdownValkey,
        onGracefulShutdownPSQL,
      }),
    ).rejects.toMatchObject({ errors: [valkeyError, psqlError] })

    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
  })

  it('bounds an incomplete shutdown with exit code 1', async () => {
    const forceExitTimer = captureForceExitTimer()
    const deferred = createDeferred<void>()
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const shutdown = shutdownDataStoresForOneOffCommand({
      onGracefulShutdownValkey: () => deferred.promise,
      onGracefulShutdownPSQL: async () => {},
    })

    forceExitTimer.fire()

    expect(errorSpy).toHaveBeenCalledWith(
      'One-off shutdown: process did not terminate in time, forcing exit...',
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(forceExitTimer.unref).not.toHaveBeenCalled()

    deferred.resolve()
    await shutdown
  })

  it('forces a nonzero exit when native handles remain after cleanup succeeds', async () => {
    const forceExitTimer = captureForceExitTimer()
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await shutdownDataStoresForOneOffCommand({
      onGracefulShutdownValkey: async () => {},
      onGracefulShutdownPSQL: async () => {},
    })
    expect(forceExitTimer.unref).toHaveBeenCalledTimes(1)
    forceExitTimer.fire()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'One-off shutdown: process did not terminate in time, forcing exit...',
    )
  })
})
