import type * as Sentry from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { scrubSentryError, scrubSentrySpan } from '../scrub-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]

describe('Sentry event scrubbing', () => {
  it('filters expected errors before scrubbing the final event', async () => {
    const event = {
      request: {
        url: 'https://example.com/verify?token=secret',
        headers: { authorization: 'Bearer secret' },
      },
    } as unknown as Parameters<typeof scrubSentryError>[0]

    expect(scrubSentryError(event, { originalException: new ApiError('Bad', 400) })).toBeNull()
    expect(scrubSentryError(event, { originalException: new Error('Boom') })).toEqual({
      request: {
        url: 'https://example.com/verify',
        headers: { authorization: '[Filtered]' },
      },
    })
  })

  it('scrubs span URLs and credential attributes', () => {
    const span = {
      attributes: {
        'url.full': 'https://example.com/unsubscribe?token=abc123',
        'url.query': 'token=abc123',
        'http.request.header.cookie.st': 'secret',
      },
    } as unknown as SentrySpan

    const result = scrubSentrySpan(span)
    expect(result.attributes).toEqual({
      'url.full': 'https://example.com/unsubscribe',
      'http.request.header.cookie.st': '[Filtered]',
    })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { attributes: { 'http.request.method': 'GET' } } as unknown as SentrySpan
    expect(scrubSentrySpan(span)).toBe(span)
  })
})
