import { describe, expect, it } from 'vitest'
import { resolveSentryDsnEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import { createSentryServerInitOptions } from './sentry-server-options'

const createOtelSpanProcessors = () => ['otel-processor'] as never
const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never
const scrubSentryTransaction = () => ({ scrubbedTransaction: true }) as never

describe('createSentryServerInitOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(
      createSentryServerInitOptions({ ENVIRONMENT: 'production', NODE_ENV: 'production' }),
    ).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
    expect(
      createSentryServerInitOptions({
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('enables local OTel without sending Sentry events', () => {
    const options = createSentryServerInitOptions(
      {
        NODE_ENV: 'development',
        OTEL_ENABLED: '1',
      },
      {
        createOtelSpanProcessors,
        scrubSentryError,
        scrubSentrySpan,
        scrubSentryTransaction,
      },
    )

    expect(options).toMatchObject({
      dsn: undefined,
      enabled: true,
      openTelemetrySpanProcessors: ['otel-processor'],
    })
    expect(options.beforeSend?.({} as never, {} as never)).toBeNull()
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryServerInitOptions(
      { NODE_ENV: 'production' },
      { createOtelSpanProcessors, scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
    )

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryServerInitOptions(
        {
          ENVIRONMENT: environment,
          NODE_ENV: 'production',
          SENTRY_DSN: 'https://public@example.test/123',
        },
        { createOtelSpanProcessors, scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
      )

      expect(options.dsn).toBe('https://public@example.test/123')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
      expect(options.beforeSendTransaction).toBe(scrubSentryTransaction)
    },
  )

  it('uses the shared resolveSentryEnablement helper by default', () => {
    const options = createSentryServerInitOptions({
      ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
      SENTRY_DSN: 'https://public@example.test/123',
    })

    expect(options.enabled).toBe(
      resolveSentryDsnEnablement({
        dsn: 'https://public@example.test/123',
        environment: 'staging',
        otelEnabled: false,
      }).enabled,
    )
  })
})
