import { describe, expect, it } from 'vitest'
import {
  createSentryDataCollection,
  dropRequestBody,
  dropSpanRequestBody,
} from './sentry-data-collection.mts'
import { scrubSentryEvent, scrubSpanAttributes } from './sentry-event-scrubbing.mts'

const noticeBody = JSON.stringify({ legalName: 'Claimant', perjuryStatement: true })

describe('createSentryDataCollection', () => {
  it('pins the least-data collection policy', () => {
    expect(createSentryDataCollection()).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: {
          deny: [
            'x-client-ip',
            'x-forwarded-for',
            'x-forwarded',
            'forwarded-for',
            'forwarded',
            'x-vercel-forwarded-for',
            'x-real-ip',
            'x-cluster-client-ip',
            'true-client-ip',
            'fastly-client-ip',
            'fly-client-ip',
            'cf-connecting-ip',
            'cf-pseudo-ipv4',
          ],
        },
      },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    })
  })

  it('returns a fresh policy for each SDK init', () => {
    const first = createSentryDataCollection()
    const second = createSentryDataCollection()

    expect(second).not.toBe(first)
    expect(second.httpBodies).not.toBe(first.httpBodies)
  })
})

describe('request body backstops', () => {
  it('drops the request body span attribute and keeps every other attribute', () => {
    expect(
      dropSpanRequestBody({
        'http.request.body.data': noticeBody,
        'http.request.body.size': 64,
        'http.request.method': 'POST',
      }),
    ).toEqual({ 'http.request.body.size': 64, 'http.request.method': 'POST' })
  })

  it('drops the Request Interface body and keeps the rest of the request', () => {
    expect(dropRequestBody({ data: noticeBody, method: 'POST', url: '/notices' })).toEqual({
      method: 'POST',
      url: '/notices',
    })
  })

  it('returns the same reference when there is no body to drop', () => {
    const attributes = { 'http.request.method': 'GET' }
    const request = { method: 'GET' }

    expect(dropSpanRequestBody(attributes)).toBe(attributes)
    expect(dropRequestBody(request)).toBe(request)
    expect(dropRequestBody(undefined)).toBeUndefined()
  })
})

describe('Sentry scrubbing of copyright notice requests', () => {
  it('removes the body and filters the guest capability and idempotency headers on spans', () => {
    const attributes = Object.freeze({
      'http.request.body.data': noticeBody,
      'http.request.header.copyright-guest-capability': 'guest-token',
      'http.request.header.copyright_guest_capability': 'guest-token',
      'http.request.header.idempotency-key': 'retry-key',
      'http.request.header.idempotency_key': 'retry-key',
      'http.request.header.user_agent': 'test',
      'http.request.method': 'POST',
    })

    const scrubbed = scrubSpanAttributes(attributes)

    expect(scrubbed).not.toHaveProperty(['http.request.body.data'])
    expect(scrubbed).toEqual({
      'http.request.header.copyright-guest-capability': '[Filtered]',
      'http.request.header.copyright_guest_capability': '[Filtered]',
      'http.request.header.idempotency-key': '[Filtered]',
      'http.request.header.idempotency_key': '[Filtered]',
      'http.request.header.user_agent': 'test',
      'http.request.method': 'POST',
    })
  })

  it('removes the body and filters mixed-case headers in error Request Interfaces', () => {
    const event = Object.freeze({
      request: Object.freeze({
        data: noticeBody,
        headers: Object.freeze({
          'Copyright-Guest-Capability': 'guest-token',
          'Idempotency-Key': 'retry-key',
          accept: 'application/json',
        }),
        method: 'POST',
      }),
    })

    const scrubbed = scrubSentryEvent(event)

    expect(scrubbed.request).not.toHaveProperty('data')
    expect(scrubbed).toEqual({
      request: {
        headers: {
          'Copyright-Guest-Capability': '[Filtered]',
          'Idempotency-Key': '[Filtered]',
          accept: 'application/json',
        },
        method: 'POST',
      },
    })
  })
})
