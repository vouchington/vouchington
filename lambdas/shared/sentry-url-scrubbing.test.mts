import { describe, it, expect } from 'vitest'
import { scrubSentrySpan, scrubSentryTransaction } from './sentry.mts'

type SentrySpan = Parameters<typeof scrubSentrySpan>[0]
type SentryTransactionEvent = Parameters<typeof scrubSentryTransaction>[0]
type SentryTransactionHint = Parameters<typeof scrubSentryTransaction>[1]

describe('scrubSentrySpan', () => {
  it('strips the query string in place and deletes query/fragment-only attributes', () => {
    const span = {
      data: { url: 'https://example.com/unsubscribe?token=abc123', 'url.query': 'token=abc123' },
    } as unknown as SentrySpan

    const result = scrubSentrySpan(span)
    expect(result.data.url).toBe('https://example.com/unsubscribe')
    expect('url.query' in result.data).toBe(false)
    expect(
      scrubSentrySpan({
        data: { 'http.request.header.cookie.st': 'secret' },
      } as unknown as SentrySpan).data,
    ).toEqual({ 'http.request.header.cookie.st': '[Filtered]' })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { data: { 'http.method': 'GET' } } as unknown as SentrySpan
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
      },
      breadcrumbs: [{ category: 'http', data: { url: 'https://example.com/x?token=abc123' } }],
    } as unknown as SentryTransactionEvent

    const result = scrubSentryTransaction(event, {} as SentryTransactionHint)

    expect(result.request?.url).toBe('https://example.com/verify')
    expect(result.request && 'query_string' in result.request).toBe(false)
    expect(result.request?.headers).toEqual({
      authorization: '[Filtered]',
      referer: ['https://example.com/unsubscribe'],
    })
    expect(result.breadcrumbs?.[0]?.data?.url).toBe('https://example.com/x')
  })

  it('returns the same event reference when nothing needs scrubbing', () => {
    const event = {
      request: { url: 'https://example.com/verify' },
      breadcrumbs: [{ category: 'navigation' }],
    } as unknown as SentryTransactionEvent
    expect(scrubSentryTransaction(event, {} as SentryTransactionHint)).toBe(event)
  })
})
