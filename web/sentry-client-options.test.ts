import { describe, expect, it, vi } from 'vitest'
import {
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
  type RuntimePublicConfig,
} from './lib/runtime-public-config'
import {
  createSentryClientInitOptions,
  initializeSentryClient,
  type SentryInitOptions,
} from './sentry-client-options'

const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never

describe('createSentryClientInitOptions', () => {
  it('uses the configured runtime-public web DSN in deployed environments', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({
        environment: 'production',
        sentryDsn: 'https://public@example.test/123',
      }),
    })

    expect(options).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('fails closed for a deployed runtime without a valid runtime-public web DSN', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({ environment: 'production', sentryDsn: 'not-a-dsn' }),
    })

    expect(options).toMatchObject({ dsn: undefined, enabled: false })
  })

  it('stays disabled when the runtime public config bootstrap is absent', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({}),
      scrubSentryError,
      scrubSentrySpan,
    })

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryClientInitOptions({
        getRuntimePublicConfig: () => ({
          environment,
          sentryDsn: 'https://public@example.test/123',
        }),
        scrubSentryError,
        scrubSentrySpan,
      })

      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
    },
  )

  it('stays disabled for a non-deployed environment value', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({ environment: 'development' }),
      scrubSentryError,
      scrubSentrySpan,
    })

    expect(options.enabled).toBe(false)
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
