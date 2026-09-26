import { describe, expect, it } from 'vitest'
import { scrubSentrySpan } from './sentry-scrub.mts'

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
        attributes: { 'http.request.header.cookie.st': 'secret' },
      } as unknown as Parameters<typeof scrubSentrySpan>[0]).attributes,
    ).toEqual({ 'http.request.header.cookie.st': '[Filtered]' })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { attributes: { 'http.request.method': 'GET' } } as unknown as Parameters<
      typeof scrubSentrySpan
    >[0]
    expect(scrubSentrySpan(span)).toBe(span)
  })
})
