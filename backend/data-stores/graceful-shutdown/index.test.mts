import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sentryCaptureExceptionMock,
  sentryFlushMock,
} from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  SIGNAL_LISTENERS_REGISTERED,
  createDeferred,
  loadSubject,
  restoreSignalListeners,
  snapshotSignalListeners,
} from './index.test-helpers.mts'

const captureException = sentryCaptureExceptionMock

describe('graceful shutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('does not register real SIGTERM/SIGINT listeners when NODE_ENV is test', async () => {
    // index.mts skips its process.on('SIGTERM'/'SIGINT') registration under NODE_ENV === 'test'.
    // A real listener here would remove Node's default terminate-on-signal behavior, so every
    // backend Vitest fork would ignore Vitest's own SIGTERM at pool-teardown time and get
    // SIGKILLed ~500ms later instead — destroying whatever stderr was buffered. See index.mts's
    // own comment on the guard for the full rationale.
    await loadSubject()

    const globalRef = globalThis as Record<symbol, boolean>
    expect(globalRef[SIGNAL_LISTENERS_REGISTERED]).toBeFalsy()
  })

  it('tracks Valkey shutdown registration explicitly', async () => {
    const { isGracefulShutdownValkeyRegistered, registerGracefulShutdownValkey } =
      await loadSubject()

    expect(isGracefulShutdownValkeyRegistered()).toBe(false)

    registerGracefulShutdownValkey(async () => {})

    expect(isGracefulShutdownValkeyRegistered()).toBe(true)
  })

  it('addGracefulShutdownCallback registers and invokes callbacks on shutdown', async () => {
    const { addGracefulShutdownCallback, onGracefulShutdown } = await loadSubject()

    const callback = vi.fn<VitestLooseMock>(() => Promise.resolve())
    addGracefulShutdownCallback(callback)

    await onGracefulShutdown('SIGTERM')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('invokes callbacks then drain callbacks then data stores in order', async () => {
    const {
      addGracefulShutdownCallback,
      addGracefulShutdownDrainCallback,
      onGracefulShutdown,
      onGracefulShutdownValkey,
      onGracefulShutdownPSQL,
    } = await loadSubject()

    const order: string[] = []
    addGracefulShutdownCallback(() => {
      order.push('callback-1')
      return Promise.resolve()
    })
    addGracefulShutdownCallback(() => {
      order.push('callback-2')
      return Promise.resolve()
    })

    const deferred = createDeferred<void>()
    addGracefulShutdownDrainCallback(async () => {
      order.push('drain-start')
      await deferred.promise
      order.push('drain-end')
    })

    onGracefulShutdownValkey.mockImplementation(() => {
      order.push('valkey')
      return Promise.resolve()
    })
    onGracefulShutdownPSQL.mockImplementation(() => {
      order.push('psql')
      return Promise.resolve()
    })

    const shutdown = onGracefulShutdown('SIGTERM')

    await Promise.resolve()
    await Promise.resolve()

    deferred.resolve()
    await shutdown

    expect(order.indexOf('callback-1')).toBeLessThan(order.indexOf('drain-start'))
    expect(order.indexOf('callback-2')).toBeLessThan(order.indexOf('drain-start'))
    expect(order.indexOf('drain-end')).toBeLessThan(order.indexOf('valkey'))
    expect(order.indexOf('drain-end')).toBeLessThan(order.indexOf('psql'))
  })

  it('flushes Sentry after drain callbacks and data store shutdown', async () => {
    const {
      addGracefulShutdownCallback,
      addGracefulShutdownDrainCallback,
      onGracefulShutdown,
      onGracefulShutdownValkey,
      onGracefulShutdownPSQL,
    } = await loadSubject()
    const flushMock = sentryFlushMock

    const order: string[] = []
    addGracefulShutdownCallback(() => {
      order.push('callback')
      return Promise.resolve()
    })
    addGracefulShutdownDrainCallback(() => {
      order.push('drain')
      return Promise.resolve()
    })

    onGracefulShutdownValkey.mockImplementation(() => {
      order.push('valkey')
      return Promise.resolve()
    })
    onGracefulShutdownPSQL.mockImplementation(() => {
      order.push('psql')
      return Promise.resolve()
    })
    flushMock.mockImplementation(() => {
      order.push('flush')
      return Promise.resolve(true)
    })

    await onGracefulShutdown('SIGTERM')

    expect(order).toEqual(['callback', 'drain', 'valkey', 'psql', 'flush'])
    expect(flushMock).toHaveBeenCalledWith(2000)
  })

  it('is idempotent - second call is a no-op', async () => {
    const { addGracefulShutdownCallback, onGracefulShutdown, onGracefulShutdownValkey } =
      await loadSubject()

    const callback = vi.fn<VitestLooseMock>(() => Promise.resolve())
    addGracefulShutdownCallback(callback)

    await onGracefulShutdown('SIGTERM')
    await onGracefulShutdown('SIGTERM')

    expect(callback).toHaveBeenCalledTimes(1)
    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
  })

  it('callback errors are routed to onError without aborting shutdown', async () => {
    const { addGracefulShutdownCallback, onGracefulShutdown, onGracefulShutdownValkey } =
      await loadSubject()

    const error = new Error('callback failed')
    addGracefulShutdownCallback(() => Promise.reject(error))

    await onGracefulShutdown('SIGTERM')

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
  })

  it('drain callback errors are routed to onError without aborting data store shutdown', async () => {
    const { addGracefulShutdownDrainCallback, onGracefulShutdown, onGracefulShutdownValkey } =
      await loadSubject()

    const error = new Error('drain failed')
    addGracefulShutdownDrainCallback(() => Promise.reject(error))

    await onGracefulShutdown('SIGTERM')

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
  })

  it('synchronously throwing drain callback does not abort data store shutdown', async () => {
    const { addGracefulShutdownDrainCallback, onGracefulShutdown, onGracefulShutdownValkey } =
      await loadSubject()

    const error = new Error('sync drain throw')
    addGracefulShutdownDrainCallback(() => {
      throw error
    })

    await onGracefulShutdown('SIGTERM')

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
  })

  it('data store shutdown errors are routed to onError', async () => {
    const { onGracefulShutdown, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()

    const valkeyError = new Error('valkey close failed')
    onGracefulShutdownValkey.mockRejectedValueOnce(valkeyError)

    await onGracefulShutdown('SIGTERM')

    expect(captureException).toHaveBeenCalledWith(valkeyError, expect.anything())
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
  })

  it('does not call process.exit or process.kill on normal completion', async () => {
    const { onGracefulShutdown } = await loadSubject()

    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await onGracefulShutdown('SIGTERM')

    expect(exitSpy).not.toHaveBeenCalled()
    expect(killSpy).not.toHaveBeenCalled()
    expect(setTimeoutSpy).not.toHaveBeenCalled()
  })

  it('uses exit code 0 when the production force-exit timer fires after successful shutdown', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const signalListenersBefore = snapshotSignalListeners()
    process.env.NODE_ENV = 'production'
    vi.useFakeTimers()
    try {
      const { onGracefulShutdown } = await loadSubject()
      const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await onGracefulShutdown('SIGTERM')
      await vi.runOnlyPendingTimersAsync()

      expect(exitSpy).toHaveBeenCalledWith(0)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      process.env.NODE_ENV = originalNodeEnv
      restoreSignalListeners(signalListenersBefore)
    }
  })

  it('uses exit code 1 when the production force-exit timer fires before shutdown completes', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const signalListenersBefore = snapshotSignalListeners()
    process.env.NODE_ENV = 'production'
    vi.useFakeTimers()
    try {
      const { addGracefulShutdownCallback, onGracefulShutdown } = await loadSubject()
      const deferred = createDeferred<void>()
      const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      addGracefulShutdownCallback(() => deferred.promise)
      const shutdown = onGracefulShutdown('SIGTERM')
      await vi.runOnlyPendingTimersAsync()
      deferred.resolve()
      await shutdown

      expect(errorSpy).toHaveBeenCalledWith(
        'Graceful Shutdown: could not close connections in time, forcing exit...',
      )
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      vi.useRealTimers()
      process.env.NODE_ENV = originalNodeEnv
      restoreSignalListeners(signalListenersBefore)
    }
  })

  it('gracefulShutdown only closes data stores', async () => {
    const { gracefulShutdown, onGracefulShutdownValkey, onGracefulShutdownPSQL } =
      await loadSubject()

    await gracefulShutdown()

    expect(onGracefulShutdownValkey).toHaveBeenCalledTimes(1)
    expect(onGracefulShutdownPSQL).toHaveBeenCalledTimes(1)
  })

  it('supports an injected quiet logger without changing default logging', async () => {
    const { gracefulShutdown } = await loadSubject()
    const messages: unknown[][] = []
    await gracefulShutdown({ logger: (...args) => messages.push(args) })
    expect(messages).toEqual([
      ['Graceful Shutdown: Valkey connection closed.'],
      ['Graceful Shutdown: PostgreSQL connection closed.'],
    ])
  })
})
