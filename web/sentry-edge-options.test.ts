import { describe, expect, it } from 'vitest'
import { ApiError } from '@vouchington/api-client'
import { createSentryEdgeInitOptions } from './sentry-edge-options'

describe('createSentryEdgeInitOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(
      createSentryEdgeInitOptions({ ENVIRONMENT: 'production', NODE_ENV: 'production' }),
    ).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
    expect(
      createSentryEdgeInitOptions({
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryEdgeInitOptions({ NODE_ENV: 'production' })

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryEdgeInitOptions({
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
    const options = createSentryEdgeInitOptions({ NODE_ENV: 'production' })
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

  it('tags a 5xx ApiError with the gateway request id and ignores other request id text', async () => {
    const options = createSentryEdgeInitOptions({ NODE_ENV: 'production' })
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
