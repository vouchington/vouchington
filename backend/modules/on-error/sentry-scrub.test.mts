import { describe, expect, it } from 'vitest'
import { scrubSentrySpan, scrubSentryTransaction } from './sentry-scrub.mts'

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
        headers: {
          authorization: 'Bearer secret',
          referer: ['https://example.com/unsubscribe?token=abc123'],
        },
        cookies: { st: 'secret' },
      },
      breadcrumbs: [{ category: 'http', data: { url: 'https://example.com/x?token=abc123' } }],
    } as unknown as Parameters<typeof scrubSentryTransaction>[0]

    const result = scrubSentryTransaction(event, {} as Parameters<typeof scrubSentryTransaction>[1])

    expect(result.request?.url).toBe('https://example.com/verify')
    expect(result.request && 'query_string' in result.request).toBe(false)
    expect(result.request?.headers).toEqual({
      authorization: '[Filtered]',
      referer: ['https://example.com/unsubscribe'],
    })
    expect(result.request?.cookies).toEqual({ st: '[Filtered]' })
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
