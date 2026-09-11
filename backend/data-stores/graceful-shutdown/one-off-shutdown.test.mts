import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shutdownDataStoresForOneOffCommand } from './index.mts'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('one-off data-store shutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('propagates cleanup failures after attempting every data store', async () => {
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
    const deferred = createDeferred<void>()
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const shutdown = shutdownDataStoresForOneOffCommand({
      onGracefulShutdownValkey: () => deferred.promise,
      onGracefulShutdownPSQL: async () => {},
    })

    await vi.runOnlyPendingTimersAsync()

    expect(errorSpy).toHaveBeenCalledWith(
      'One-off shutdown: process did not terminate in time, forcing exit...',
    )
    expect(exitSpy).toHaveBeenCalledWith(1)

    deferred.resolve()
    await shutdown
  })

  it('forces a nonzero exit when native handles remain after cleanup succeeds', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await shutdownDataStoresForOneOffCommand({
      onGracefulShutdownValkey: async () => {},
      onGracefulShutdownPSQL: async () => {},
    })
    await vi.runOnlyPendingTimersAsync()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'One-off shutdown: process did not terminate in time, forcing exit...',
    )
  })
})
