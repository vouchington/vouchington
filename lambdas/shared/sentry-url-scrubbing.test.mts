import { describe, it, expect } from 'vitest'
import { scrubSentrySpan } from './sentry.mts'

type SentrySpan = Parameters<typeof scrubSentrySpan>[0]

describe('scrubSentrySpan', () => {
  it('strips the query string in place and deletes query/fragment-only attributes', () => {
    const span = {
      attributes: {
        'url.full': 'https://example.com/unsubscribe?token=abc123',
        'url.query': 'token=abc123',
      },
    } as unknown as SentrySpan

    const result = scrubSentrySpan(span)
    expect(result.attributes['url.full']).toBe('https://example.com/unsubscribe')
    expect('url.query' in result.attributes).toBe(false)
    expect(
      scrubSentrySpan({
        attributes: { 'http.request.header.cookie.st': 'secret' },
      } as unknown as SentrySpan).attributes,
    ).toEqual({ 'http.request.header.cookie.st': '[Filtered]' })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { attributes: { 'http.request.method': 'GET' } } as unknown as SentrySpan
    expect(scrubSentrySpan(span)).toBe(span)
  })
})
