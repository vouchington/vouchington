import { describe, it, expect } from 'vitest'
import { createSentryOptions, scrubSentrySpan, scrubSentryTransaction } from '../sentry.mts'

describe('createSentryOptions', () => {
  it.each(['staging', 'production'] as const)(
    'returns enabled=true for the deployed environment %s',
    environment => {
      const opts = createSentryOptions({ ENVIRONMENT: environment })
      expect(opts.enabled).toBe(true)
      expect(opts.environment).toBe(environment)
      expect(opts.dsn).toContain('4511154639077376')
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

  it('wires scrubbing for errors, spans, and transactions', () => {
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
    expect(opts.beforeSendTransaction).toBe(scrubSentryTransaction)
  })
})

describe('scrubSentrySpan', () => {
  it('strips the query string in place and deletes query/fragment-only attributes', () => {
    const span = {
      data: { url: 'https://example.com/unsubscribe?token=abc123', 'url.query': 'token=abc123' },
    } as unknown as Parameters<typeof scrubSentrySpan>[0]

    const result = scrubSentrySpan(span)
    expect(result.data.url).toBe('https://example.com/unsubscribe')
    expect('url.query' in result.data).toBe(false)
    expect(
      scrubSentrySpan({
        data: { 'http.request.header.cookie.st': 'secret' },
      } as unknown as Parameters<typeof scrubSentrySpan>[0]).data,
    ).toEqual({ 'http.request.header.cookie.st': '[Filtered]' })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { data: { 'http.method': 'GET' } } as unknown as Parameters<
      typeof scrubSentrySpan
    >[0]
    expect(scrubSentrySpan(span)).toBe(span)
  })
})

describe('scrubSentryTransaction', () => {
  it('scrubs request URL fields and breadcrumb URL data', () => {
    const event = {
      request: {
        url: 'https://example.com/verify?token=abc123',
        query_string: 'token=abc123',
        cookies: { dt: 'secret' },
        headers: { referer: ['https://example.com/unsubscribe?token=abc123'] },
      },
      breadcrumbs: [{ category: 'http', data: { url: 'https://example.com/x?token=abc123' } }],
    } as unknown as Parameters<typeof scrubSentryTransaction>[0]

    const result = scrubSentryTransaction(event, {} as Parameters<typeof scrubSentryTransaction>[1])

    expect(result.request?.url).toBe('https://example.com/verify')
    expect(result.request && 'query_string' in result.request).toBe(false)
    expect(result.request?.cookies).toEqual({ dt: '[Filtered]' })
    expect(result.request?.headers).toEqual({ referer: ['https://example.com/unsubscribe'] })
    expect(result.breadcrumbs?.[0]?.data?.url).toBe('https://example.com/x')
  })

  it('returns the same event reference when nothing needs scrubbing', () => {
    const event = {
      request: { url: 'https://example.com/verify' },
      breadcrumbs: [{ category: 'navigation' }],
    } as unknown as Parameters<typeof scrubSentryTransaction>[0]
    expect(scrubSentryTransaction(event, {} as Parameters<typeof scrubSentryTransaction>[1])).toBe(
      event,
    )
  })
})
