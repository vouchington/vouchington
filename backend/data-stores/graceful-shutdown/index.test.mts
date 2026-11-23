import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gracefulShutdownPeriodSeconds } from '@voucha/config'
import {
  sentryCaptureExceptionMock,
  sentryFlushMock,
} from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  SIGNAL_LISTENERS_REGISTERED,
  loadSubject,
  restoreSignalListeners,
  snapshotSignalListeners,
} from '@voucha/test-helpers/data-stores/graceful-shutdown/index.fixtures'

/**
 * Capture only the force-exit timer instead of installing process-wide fake timers: the fork's
 * live GlideMQ worker schedules its wakes with `setTimeout`, and faking or clearing them strands
 * an in-flight background job. Every other timer still reaches the real `setTimeout`.
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

describe('graceful shutdown wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not register real SIGTERM/SIGINT listeners when NODE_ENV is test', async () => {
    // A real listener would remove Node's default terminate-on-signal behavior, so every backend
    // Vitest fork would ignore Vitest's own SIGTERM at pool-teardown time and get SIGKILLed.
    await loadSubject()

    const globalRef = globalThis as Record<symbol, boolean>
    expect(globalRef[SIGNAL_LISTENERS_REGISTERED]).toBeFalsy()
  })

  it('closes the registered data stores, then flushes Sentry for two seconds', async () => {
    const { onGracefulShutdown, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()
    const order: string[] = []
    onGracefulShutdownValkey.mockImplementation(async () => {
      order.push('valkey')
    })
    onGracefulShutdownPSQL.mockImplementation(async () => {
      order.push('psql')
    })
    sentryFlushMock.mockImplementation(async () => {
      order.push('flush')
      return true
    })

    await onGracefulShutdown('SIGTERM')

    expect(order).toEqual(['valkey', 'psql', 'flush'])
    expect(sentryFlushMock).toHaveBeenCalledWith(2000)
  })

  it('reports a failing data store to onError and still closes the others and flushes', async () => {
    const { onGracefulShutdown, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()
    const valkeyError = new Error('valkey close failed')
    onGracefulShutdownValkey.mockRejectedValueOnce(valkeyError)

    await onGracefulShutdown('SIGTERM')

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(valkeyError, {
      tags: { shutdown_resource: 'Valkey' },
    })
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
    expect(sentryFlushMock).toHaveBeenCalledWith(2000)
  })

  it('reports a failing callback as its original error tagged with phase and signal', async () => {
    const { onGracefulShutdown, addGracefulShutdownCallback } = await loadSubject()
    const callbackError = new Error('drain queue failed')
    addGracefulShutdownCallback(async () => {
      throw callbackError
    })

    await onGracefulShutdown('SIGTERM')

    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(callbackError, {
      tags: { shutdown_phase: 'callbacks', shutdown_signal: 'SIGTERM' },
    })
  })

  it('wraps a non-Error rejection so Sentry still gets an Error with the resource', async () => {
    const { gracefulShutdown, onGracefulShutdownValkey } = await loadSubject()
    onGracefulShutdownValkey.mockRejectedValueOnce('valkey gone')

    await gracefulShutdown()

    const [reported, context] = sentryCaptureExceptionMock.mock.calls[0] ?? []
    expect(reported).toBeInstanceOf(Error)
    expect(reported).toMatchObject({
      message: 'valkey gone',
      cause: { cause: 'valkey gone' },
    })
    expect(context).toEqual({ tags: { shutdown_resource: 'Valkey' } })
  })

  it('reports a frozen failure without mutating it and still reports later failures', async () => {
    const { onGracefulShutdown, addGracefulShutdownCallback } = await loadSubject()
    const frozenError: Error = Object.freeze(new Error('frozen failure'))
    const laterError = new Error('later failure')
    addGracefulShutdownCallback(async () => {
      throw frozenError
    })
    addGracefulShutdownCallback(async () => {
      throw laterError
    })

    await expect(onGracefulShutdown('SIGTERM')).resolves.toBeUndefined()

    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(2)
    const [reported, context] = sentryCaptureExceptionMock.mock.calls[0] ?? []
    expect(reported).not.toBe(frozenError)
    expect(reported).toMatchObject({ message: 'frozen failure' })
    expect(context).toEqual({ tags: { shutdown_phase: 'callbacks', shutdown_signal: 'SIGTERM' } })
    expect(Object.hasOwn(frozenError, 'tags')).toBe(false)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(laterError, expect.anything())
  })

  it('gracefulShutdown only closes data stores', async () => {
    const { gracefulShutdown, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()

    await gracefulShutdown()

    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
    expect(sentryFlushMock).not.toHaveBeenCalled()
  })

  it('does not schedule the force-exit timer under test', async () => {
    const { onGracefulShutdown } = await loadSubject()
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await onGracefulShutdown('SIGTERM')

    expect(exitSpy).not.toHaveBeenCalled()
    expect(setTimeoutSpy).not.toHaveBeenCalled()
  })

  it('exits 0 after the configured grace period once production shutdown succeeded', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const signalListenersBefore = snapshotSignalListeners()
    process.env.NODE_ENV = 'production'
    vi.useFakeTimers()
    try {
      const { onGracefulShutdown } = await loadSubject()
      const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await onGracefulShutdown('SIGTERM')
      await vi.runOnlyPendingTimersAsync()

      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        gracefulShutdownPeriodSeconds * 1000,
      )
      expect(exitSpy).toHaveBeenCalledWith(0)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = originalNodeEnv
      restoreSignalListeners(signalListenersBefore)
    }
  })
})

describe('one-off data-store shutdown wiring', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('propagates cleanup failures after attempting every registered data store', async () => {
    captureForceExitTimer()
    const { shutdownDataStoresForOneOffCommand, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()
    const valkeyError = new Error('valkey close failed')
    const psqlError = new Error('psql close failed')
    onGracefulShutdownValkey.mockRejectedValue(valkeyError)
    onGracefulShutdownPSQL.mockRejectedValue(psqlError)

    const rejection: unknown = await shutdownDataStoresForOneOffCommand().catch(
      (err: unknown) => err,
    )

    expect(rejection).toBeInstanceOf(AggregateError)
    const causes = (rejection as AggregateError).errors.map((error: Error) => error.cause)
    expect(causes).toEqual([valkeyError, psqlError])

    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
  })

  it('forces a nonzero exit when native handles remain after cleanup succeeds', async () => {
    const forceExitTimer = captureForceExitTimer()
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { shutdownDataStoresForOneOffCommand } = await loadSubject()

    await shutdownDataStoresForOneOffCommand()
    expect(forceExitTimer.unref).toHaveBeenCalledTimes(1)
    forceExitTimer.fire()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
