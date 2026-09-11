import type * as Sentry from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { scrubSentryError, scrubSentrySpan, scrubSentryTransaction } from '../scrub-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]
type SentryTransactionEvent = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[0]
type SentryTransactionHint = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[1]

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
      data: {
        url: 'https://example.com/unsubscribe?token=abc123',
        'url.query': 'token=abc123',
        'http.request.header.cookie.st': 'secret',
      },
    } as unknown as SentrySpan

    const result = scrubSentrySpan(span)
    expect(result.data).toEqual({
      url: 'https://example.com/unsubscribe',
      'http.request.header.cookie.st': '[Filtered]',
    })
  })

  it('returns the same span reference when no attributes need scrubbing', () => {
    const span = { data: { 'http.method': 'GET' } } as unknown as SentrySpan
    expect(scrubSentrySpan(span)).toBe(span)
  })

  it('scrubs request and breadcrumb metadata from transactions', () => {
    const event = {
      request: {
        url: 'https://example.com/verify?token=abc123',
        query_string: 'token=abc123',
        cookies: { st: 'secret' },
        headers: { referer: ['https://example.com/unsubscribe?token=abc123'] },
      },
      breadcrumbs: [{ category: 'http', data: { url: 'https://example.com/x?token=abc123' } }],
    } as unknown as SentryTransactionEvent

    const result = scrubSentryTransaction(event, {} as SentryTransactionHint)
    expect(result.request).toEqual({
      url: 'https://example.com/verify',
      cookies: { st: '[Filtered]' },
      headers: { referer: ['https://example.com/unsubscribe'] },
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
