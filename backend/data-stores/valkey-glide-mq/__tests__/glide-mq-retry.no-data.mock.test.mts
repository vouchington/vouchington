import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sentryAddBreadcrumbMock as addBreadcrumb,
  sentryCaptureExceptionMock as captureException,
  sentryCaptureMessageMock as captureMessage,
} from '../../../test-helpers/vitest.setup.sentry-mock.mts'

// Mock node:crypto so randomInt always returns 0 → zero delay so fake timers fire instantly
vi.mock<typeof import('node:crypto')>(import('node:crypto'), async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>()
  return { ...original, randomInt: () => 0 }
})

describe('retryOnInflightSaturation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureException.mockClear()
    captureMessage.mockClear()
    addBreadcrumb.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately on success — no retries, no breadcrumbs', async () => {
    const { retryOnInflightSaturation } = await import('../glide-mq-retry.mts')
    const fn = vi.fn<() => Promise<string>>(() => Promise.resolve('ok'))

    const result = await retryOnInflightSaturation(fn, {
      command: 'xadd',
      client: 'worker-queue-command',
    })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledOnce()
    expect(addBreadcrumb).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('retries once on saturation, resolves on second attempt — breadcrumb recorded', async () => {
    const { retryOnInflightSaturation } = await import('../glide-mq-retry.mts')
    let calls = 0
    const fn = vi.fn<() => Promise<string>>(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error('Reached maximum inflight requests'))
      return Promise.resolve('ok')
    })

    const promise = retryOnInflightSaturation(fn, {
      command: 'xadd',
      client: 'worker-queue-command',
    })
    // Advance past the zero delay so setTimeout resolves
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    // breadcrumb should be recorded on the retry attempt (attempt=1)
    expect(addBreadcrumb).toHaveBeenCalledOnce()
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'valkey',
      message: 'inflight saturation retry',
      level: 'warning',
      data: { client: 'worker-queue-command', command: 'xadd', attempt: 1 },
    })
    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith('valkey_inflight_saturation', {
      level: 'warning',
      tags: {
        reason: 'valkey_inflight_saturation',
        client: 'worker-queue-command',
        command: 'xadd',
      },
      extra: { attempt: 1 },
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('does not retry non-saturation errors — throws immediately', async () => {
    const { retryOnInflightSaturation } = await import('../glide-mq-retry.mts')
    const err = new Error('Connection closed')
    const fn = vi.fn<() => Promise<string>>(() => Promise.reject(err))

    await expect(
      retryOnInflightSaturation(fn, { command: 'xreadgroup', client: 'worker-queue-command' }),
    ).rejects.toThrow('Connection closed')

    expect(fn).toHaveBeenCalledOnce()
    expect(addBreadcrumb).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('exhausts all attempts — decorates error with tags+extra, calls onError, rethrows', async () => {
    const { retryOnInflightSaturation } = await import('../glide-mq-retry.mts')
    const saturationErr = new Error('Reached maximum inflight requests')
    const fn = vi.fn<() => Promise<string>>(() => Promise.reject(saturationErr))

    // Attach .catch immediately so intermediate rejections are never unhandled.
    const thrownPromise = retryOnInflightSaturation(fn, {
      command: 'xack',
      client: 'worker-queue-command',
    }).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const thrown = await thrownPromise

    expect(thrown).toBe(saturationErr)
    const decoratedErr = thrown as typeof saturationErr & {
      tags?: Record<string, unknown>
      extra?: Record<string, unknown>
    }
    expect(decoratedErr.tags).toMatchObject({
      reason: 'valkey_inflight_saturation',
      client: 'worker-queue-command',
      command: 'xack',
    })
    expect(decoratedErr.extra).toMatchObject({ attempts: 3 })
    // onError ultimately calls captureException via @sentry/node
    expect(captureException).toHaveBeenCalledWith(saturationErr, expect.anything())
    // breadcrumbs should be recorded for attempts 1 and 2 (not attempt 0)
    expect(addBreadcrumb).toHaveBeenCalledTimes(2)
    expect(captureMessage).toHaveBeenCalledTimes(2)
  })

  it('VALKEY_INFLIGHT_RETRY_ATTEMPTS env var overrides attempt count', async () => {
    process.env.VALKEY_INFLIGHT_RETRY_ATTEMPTS = '2'
    try {
      const { retryOnInflightSaturation } = await import('../glide-mq-retry.mts')
      const fn = vi.fn<() => Promise<string>>(() =>
        Promise.reject(new Error('Reached maximum inflight requests')),
      )

      // Attach .catch immediately so intermediate rejections are never unhandled.
      const thrownPromise = retryOnInflightSaturation(fn, {
        command: 'xadd',
        client: 'worker-queue-command',
      }).catch((e: unknown) => e)
      await vi.runAllTimersAsync()
      const thrown = await thrownPromise

      expect(thrown).toBeInstanceOf(Error)
      expect(fn).toHaveBeenCalledTimes(2)
      const decoratedErr = thrown as Error & { extra?: Record<string, unknown> }
      expect(decoratedErr.extra).toMatchObject({ attempts: 2 })
    } finally {
      delete process.env.VALKEY_INFLIGHT_RETRY_ATTEMPTS
    }
  })

  it('recordValkeySaturation emits console.warn in development mode', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordValkeySaturation } = await import('@modules/on-error')
      const context = { client: 'test-client', command: 'xadd', attempt: 1 }
      recordValkeySaturation(context)
      expect(warnSpy).toHaveBeenCalledWith('[valkey] inflight saturation retry', context)
    } finally {
      process.env.NODE_ENV = originalEnv
      warnSpy.mockRestore()
    }
  })

  it('throttles Sentry saturation messages per client command outside test mode', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const { recordValkeySaturation } = await import('@modules/on-error')
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 2 })
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xack', attempt: 3 })

      vi.advanceTimersByTime(10_000)
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 4 })

      expect(addBreadcrumb).toHaveBeenCalledTimes(4)
      expect(captureMessage).toHaveBeenCalledTimes(3)
      expect(captureMessage).toHaveBeenNthCalledWith(1, 'valkey_inflight_saturation', {
        level: 'warning',
        tags: {
          reason: 'valkey_inflight_saturation',
          client: 'worker-queue-command',
          command: 'xadd',
        },
        extra: { attempt: 1 },
      })
      expect(captureMessage).toHaveBeenNthCalledWith(2, 'valkey_inflight_saturation', {
        level: 'warning',
        tags: {
          reason: 'valkey_inflight_saturation',
          client: 'worker-queue-command',
          command: 'xack',
        },
        extra: { attempt: 3 },
      })
      expect(captureMessage).toHaveBeenNthCalledWith(3, 'valkey_inflight_saturation', {
        level: 'warning',
        tags: {
          reason: 'valkey_inflight_saturation',
          client: 'worker-queue-command',
          command: 'xadd',
        },
        extra: { attempt: 4 },
      })
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})

describe('retryTransientEnqueue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when the wrapped function resolves', async () => {
    const { retryTransientEnqueue } = await import('../glide-mq-retry.mts')
    const fn = vi.fn<() => Promise<string>>(() => Promise.resolve('enqueued'))

    await expect(retryTransientEnqueue(fn)).resolves.toBe('enqueued')
    expect(fn).toHaveBeenCalledOnce()
  })
})
