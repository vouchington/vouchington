import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@vouchington/api-client'
import {
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
  type RuntimePublicConfig,
} from './lib/runtime-public-config'
import { initializeSentryClient, type SentryInitOptions } from './sentry-client-options'

describe('initialized Sentry options', () => {
  it('uses the configured runtime-public web DSN in deployed environments', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({
          environment: 'production',
          sentryDsn: 'https://public@example.test/123',
        }),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]

    expect(options).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('fails closed for a deployed runtime without a valid runtime-public web DSN', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({ environment: 'production', sentryDsn: 'not-a-dsn' }),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]

    expect(options).toMatchObject({ dsn: undefined, enabled: false })
  })

  it('stays disabled when the runtime public config bootstrap is absent', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({}),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const init = vi.fn<(options: SentryInitOptions) => void>()
      initializeSentryClient(
        init,
        {
          getRuntimePublicConfig: () => ({
            environment,
            sentryDsn: 'https://public@example.test/123',
          }),
        },
        window,
      )
      expect(init).toHaveBeenCalledOnce()
      const options = init.mock.calls[0]![0]

      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
    },
  )

  it('stays disabled for a non-deployed environment value', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({ environment: 'development' }),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]

    expect(options.enabled).toBe(false)
  })

  it('sets no replay sample rates because no replay integration is registered', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({ environment: 'production' }),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]

    expect(options).not.toHaveProperty('replaysSessionSampleRate')
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate')
  })

  it('tags a 5xx ApiError with the gateway request id and ignores other request id text', async () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({ environment: 'production' }),
      },
      window,
    )
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]![0]
    const requestId = '11111111-1111-4111-8111-111111111111'
    const event = {
      tags: { surface: 'post' },
      request: { url: 'https://example.com/x?token=secret' },
    } as never

    expect(
      await options.beforeSend?.(event, {
        originalException: new ApiError('Boom', 500, {
          request_id: requestId,
          code: 'INTERNAL_ERROR',
        }),
      }),
    ).toEqual({
      tags: { surface: 'post', request_id: requestId },
      request: { url: 'https://example.com/x' },
    })
    expect(
      await options.beforeSend?.(event, {
        originalException: new ApiError('Boom', 500, { request_id: 'person@example.test' }),
      }),
    ).toEqual({
      tags: { surface: 'post' },
      request: { url: 'https://example.com/x' },
    })
  })
})

describe('initializeSentryClient', () => {
  it('initializes immediately when the runtime bootstrap is already available', () => {
    const init = vi.fn<(options: SentryInitOptions) => void>()
    initializeSentryClient(
      init,
      {
        getRuntimePublicConfig: () => ({
          environment: 'production',
          sentryDsn: 'https://public@example.test/123',
        }),
      },
      {
        addEventListener:
          vi.fn<(type: string, listener: () => void, options: { once: true }) => void>(),
      },
    )

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://public@example.test/123', enabled: true }),
    )
  })

  it('waits for the runtime bootstrap event before initializing', () => {
    let readyListener: (() => void) | undefined
    let runtimeConfig: RuntimePublicConfig | undefined
    const runtimeTarget = {
      addEventListener: (type, listener, options) => {
        expect(type).toBe(RUNTIME_PUBLIC_CONFIG_READY_EVENT)
        expect(options).toEqual({ once: true })
        readyListener = listener
      },
    } satisfies {
      addEventListener(type: string, listener: () => void, options: { once: true }): void
    }
    const init = vi.fn<(options: SentryInitOptions) => void>()

    initializeSentryClient(init, { getRuntimePublicConfig: () => runtimeConfig }, runtimeTarget)
    expect(init).not.toHaveBeenCalled()
    runtimeConfig = {
      environment: 'production',
      sentryDsn: 'https://public@example.test/123',
    }
    readyListener?.()

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://public@example.test/123', enabled: true }),
    )
  })
})
