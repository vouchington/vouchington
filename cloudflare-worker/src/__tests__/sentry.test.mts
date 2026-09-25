import { describe, it, expect } from 'vitest'
import { createSentryOptions, scrubSentrySpan } from '../sentry.mts'

describe('createSentryOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(createSentryOptions({ ENVIRONMENT: 'production' })).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
    expect(
      createSentryOptions({
        ENVIRONMENT: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it.each(['staging', 'production'] as const)(
    'returns enabled=true for the deployed environment %s',
    environment => {
      const opts = createSentryOptions({
        ENVIRONMENT: environment,
        SENTRY_DSN: 'https://public@example.test/123',
      })
      expect(opts.enabled).toBe(true)
      expect(opts.environment).toBe(environment)
      expect(opts.dsn).toBe('https://public@example.test/123')
      expect(opts.tracesSampleRate).toBe(0.1)
    },
  )

  it('returns enabled=false when ENVIRONMENT is unset', () => {
    const opts = createSentryOptions({})
    expect(opts.enabled).toBe(false)
    expect(opts.environment).toBe('development')
  })

  it('returns enabled=false for a non-allowlisted ENVIRONMENT, even with PRODUCTION=true', () => {
    const opts = createSentryOptions({ PRODUCTION: 'true' })
    expect(opts.enabled).toBe(false)
  })

  it('passes GIT_COMMIT as release', () => {
    const opts = createSentryOptions({ ENVIRONMENT: 'production', GIT_COMMIT: 'abc123' })
    expect(opts.release).toBe('abc123')
  })

  it('sets release to undefined when GIT_COMMIT is missing', () => {
    const opts = createSentryOptions({ ENVIRONMENT: 'production' })
    expect(opts.release).toBeUndefined()
  })

  it('wires scrubbing for errors and spans', () => {
    const opts = createSentryOptions({ ENVIRONMENT: 'production' })
    expect(
      opts.beforeSend?.(
        {
          type: undefined,
          request: {
            url: 'https://example.com/x?token=secret',
            headers: { authorization: 'Bearer secret' },
          },
        },
        {},
      ),
    ).toEqual({
      request: {
        url: 'https://example.com/x',
        headers: { authorization: '[Filtered]' },
      },
    })
    expect(opts.beforeSendSpan).toBe(scrubSentrySpan)
  })
})

describe('scrubSentrySpan', () => {
  it('strips the query string in place and deletes query/fragment-only attributes', () => {
    const span = {
      attributes: {
        'url.full': 'https://example.com/unsubscribe?token=abc123',
        'url.query': 'token=abc123',
      },
    } as unknown as Parameters<typeof scrubSentrySpan>[0]

    const result = scrubSentrySpan(span)
    expect(result.attributes['url.full']).toBe('https://example.com/unsubscribe')
    expect('url.query' in result.attributes).toBe(false)
    expect(
      scrubSentrySpan({
        attributes: { 'http.request.header.cookie.dt': 'secret' },
      } as unknown as Parameters<typeof scrubSentrySpan>[0]).attributes,
    ).toEqual({ 'http.request.header.cookie.dt': '[Filtered]' })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { attributes: { 'http.request.method': 'GET' } } as unknown as Parameters<
      typeof scrubSentrySpan
    >[0]
    expect(scrubSentrySpan(span)).toBe(span)
  })
})
