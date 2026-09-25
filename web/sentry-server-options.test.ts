import { describe, expect, it } from 'vitest'
import { resolveSentryDsnEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import { createSentryServerInitOptions } from './sentry-server-options'

const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never

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
      { scrubSentryError, scrubSentrySpan },
    )

    expect(options).toMatchObject({ dsn: undefined, enabled: true })
    expect(options.beforeSend?.({} as never, {} as never)).toBeNull()
  })

  it('leaves the global TracerProvider to the OTel preload only when OTEL_ENABLED=1', () => {
    expect(
      createSentryServerInitOptions({ NODE_ENV: 'development', OTEL_ENABLED: '1' }),
    ).toMatchObject({ enableOpenTelemetrySetup: false })
    expect(createSentryServerInitOptions({ NODE_ENV: 'development' })).not.toHaveProperty(
      'enableOpenTelemetrySetup',
    )
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryServerInitOptions(
      { NODE_ENV: 'production' },
      { scrubSentryError, scrubSentrySpan },
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
        { scrubSentryError, scrubSentrySpan },
      )

      expect(options.dsn).toBe('https://public@example.test/123')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
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
