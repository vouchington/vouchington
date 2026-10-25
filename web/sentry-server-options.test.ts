import { describe, expect, it } from 'vitest'
import { ApiError } from '@vouchington/api-client'
import { createSentryServerInitOptions } from './sentry-server-options'

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

  it('leaves the global TracerProvider to the OTel preload only when OTEL_ENABLED=1', () => {
    expect(
      createSentryServerInitOptions({ NODE_ENV: 'development', OTEL_ENABLED: '1' }),
    ).toMatchObject({ enableOpenTelemetrySetup: false })
    expect(createSentryServerInitOptions({ NODE_ENV: 'development' })).not.toHaveProperty(
      'enableOpenTelemetrySetup',
    )
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryServerInitOptions({ NODE_ENV: 'production' })

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryServerInitOptions({
        ENVIRONMENT: environment,
        NODE_ENV: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      })

      expect(options.dsn).toBe('https://public@example.test/123')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
    },
  )

  it('drops expected 4xx ApiError events and keeps 5xx ones', async () => {
    const options = createSentryServerInitOptions({ NODE_ENV: 'production' })
    const event = { request: { url: 'https://example.com/x?token=secret' } } as never

    expect(
      await options.beforeSend?.(event, { originalException: new ApiError('Bad', 400) }),
    ).toBeNull()
    expect(
      await options.beforeSend?.(event, { originalException: new ApiError('Boom', 500) }),
    ).toEqual({
      request: { url: 'https://example.com/x' },
    })
  })
})
