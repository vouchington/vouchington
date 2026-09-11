import { describe, expect, it } from 'vitest'
import {
  scrubEventBreadcrumbs,
  scrubRequestUrlFields,
  scrubSpanUrlAttributes,
  SCRUBBED_URL_ATTRIBUTE_KEYS,
  stripUrlQueryString,
} from './observability-scrubbing.mts'

describe('stripUrlQueryString', () => {
  it('strips a query string from an absolute URL', () => {
    expect(stripUrlQueryString('https://example.com/reset?token=abc123')).toBe(
      'https://example.com/reset',
    )
  })

  it('strips a fragment from an absolute URL', () => {
    expect(stripUrlQueryString('https://example.com/callback#access_token=abc123')).toBe(
      'https://example.com/callback',
    )
  })

  it('strips both a query string and a fragment', () => {
    expect(stripUrlQueryString('https://example.com/reset?token=abc123#section')).toBe(
      'https://example.com/reset',
    )
  })

  it('strips a query string from a relative path', () => {
    expect(stripUrlQueryString('/reset?token=abc123')).toBe('/reset')
  })

  it('returns the input unchanged when there is no query string or fragment', () => {
    expect(stripUrlQueryString('https://example.com/reset')).toBe('https://example.com/reset')
  })

  it('returns an empty string unchanged', () => {
    expect(stripUrlQueryString('')).toBe('')
  })

  it('strips a fragment-only URL down to an empty string', () => {
    expect(stripUrlQueryString('#fragment')).toBe('')
  })

  it('treats the first of a fragment then a query string as the cut point per RFC 3986', () => {
    expect(stripUrlQueryString('https://example.com/a#b?c=1')).toBe('https://example.com/a')
  })
})

describe('scrubSpanUrlAttributes', () => {
  it('redacts Grafana heartbeat bearer credentials carried in URL paths', () => {
    const credentialUrl =
      'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/secret-token/heartbeat/?ignored=yes'

    expect(scrubSpanUrlAttributes({ 'url.full': credentialUrl })).toEqual({
      'url.full':
        'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/',
    })
  })

  const FULL_URL_FIXTURE = 'https://example.com/unsubscribe?token=abc123'
  const STRIPPED_URL_FIXTURE = 'https://example.com/unsubscribe'

  it.each([
    ['url', FULL_URL_FIXTURE, STRIPPED_URL_FIXTURE],
    ['url.full', FULL_URL_FIXTURE, STRIPPED_URL_FIXTURE],
    ['http.url', FULL_URL_FIXTURE, STRIPPED_URL_FIXTURE],
    ['http.target', '/unsubscribe?token=abc123', '/unsubscribe'],
    ['http.target', '?token=abc123', ''],
    ['http.request.header.referer', FULL_URL_FIXTURE, STRIPPED_URL_FIXTURE],
    ['http.request.header.referrer', FULL_URL_FIXTURE, STRIPPED_URL_FIXTURE],
  ])('strips the query string from %s in place', (key, value, expected) => {
    const result = scrubSpanUrlAttributes({ [key]: value })
    expect(result[key]).toBe(expected)
    expect(key in result).toBe(true)
  })

  it.each([['url.query'], ['http.query'], ['url.fragment'], ['http.fragment']])(
    'deletes %s entirely rather than overwriting it',
    key => {
      const result = scrubSpanUrlAttributes({ [key]: 'token=abc123' })
      expect(key in result).toBe(false)
    },
  )

  it('covers all 10 documented attribute keys', () => {
    expect(SCRUBBED_URL_ATTRIBUTE_KEYS).toHaveLength(10)

    const data = Object.fromEntries(
      SCRUBBED_URL_ATTRIBUTE_KEYS.map(key => [key, `${FULL_URL_FIXTURE}#token=abc123`]),
    )
    const result = scrubSpanUrlAttributes(data)
    for (const key of SCRUBBED_URL_ATTRIBUTE_KEYS) {
      const value = result[key]
      const wasDeleted = !(key in result)
      const wasStripped = typeof value === 'string' && !value.includes('token=abc123')
      expect(wasDeleted || wasStripped).toBe(true)
    }
  })

  it('leaves unrelated attributes untouched', () => {
    const result = scrubSpanUrlAttributes({ 'http.method': 'GET', 'http.status_code': 200 })
    expect(result).toEqual({ 'http.method': 'GET', 'http.status_code': 200 })
  })

  it('returns the same object reference when no URL-bearing key is present', () => {
    const input = { 'http.method': 'GET' }
    expect(scrubSpanUrlAttributes(input)).toBe(input)
  })

  it('returns the same object reference when a URL-bearing value is already safe', () => {
    const input = { url: 'https://example.com/safe' }
    expect(scrubSpanUrlAttributes(input)).toBe(input)
  })

  it('does not mutate the input object', () => {
    const input = { url: FULL_URL_FIXTURE }
    scrubSpanUrlAttributes(input)
    expect(input.url).toBe(FULL_URL_FIXTURE)
  })

  it('preserves adversarial own data-property keys when rebuilding span data', () => {
    const input = Object.fromEntries([
      ['constructor', 'constructor-value'],
      ['__proto__', 'proto-value'],
      ['url', 'https://example.com/path?token=secret'],
    ])

    const result = scrubSpanUrlAttributes(input)
    expect(Object.hasOwn(result, 'constructor')).toBe(true)
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(result.constructor).toBe('constructor-value')
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe('proto-value')
    expect(result.url).toBe('https://example.com/path')
  })
})

describe('scrubEventBreadcrumbs', () => {
  it('scrubs URL attributes on each breadcrumb with data', () => {
    const result = scrubEventBreadcrumbs([
      { category: 'http', data: { url: 'https://example.com/x?token=abc123' } },
      { category: 'http', data: { 'http.query': 'token=abc123' } },
    ])

    expect(result?.[0]?.data?.url).toBe('https://example.com/x')
    expect(result?.[1]?.data && 'http.query' in result[1].data).toBe(false)
  })

  it('passes through breadcrumbs without data untouched', () => {
    const breadcrumbs: { category: string; data?: Record<string, unknown> }[] = [
      { category: 'navigation' },
    ]
    expect(scrubEventBreadcrumbs(breadcrumbs)).toEqual(breadcrumbs)
  })

  it('passes through undefined and empty arrays', () => {
    expect(scrubEventBreadcrumbs(undefined)).toBeUndefined()
    expect(scrubEventBreadcrumbs([])).toEqual([])
  })

  it('returns the same array reference when no breadcrumb data needs scrubbing', () => {
    const breadcrumbs = [{ category: 'http', data: { 'http.method': 'GET' } }]
    expect(scrubEventBreadcrumbs(breadcrumbs)).toBe(breadcrumbs)
  })
})

describe('scrubRequestUrlFields', () => {
  it('redacts a Grafana heartbeat credential even when the URL has no query', () => {
    const result = scrubRequestUrlFields({
      url: 'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/secret-token/heartbeat/',
    })
    expect(result?.url).toBe(
      'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/',
    )
  })

  it('strips the query string from the request URL', () => {
    const result = scrubRequestUrlFields({ url: 'https://example.com/verify?token=abc123' })
    expect(result?.url).toBe('https://example.com/verify')
  })

  it('deletes query_string entirely rather than overwriting it', () => {
    const result = scrubRequestUrlFields({
      url: 'https://example.com/verify',
      query_string: 'token=abc123',
    })
    expect(result && 'query_string' in result).toBe(false)
  })

  it('leaves other request fields untouched', () => {
    const result = scrubRequestUrlFields({
      url: 'https://example.com/verify?token=abc123',
      method: 'GET',
      headers: { 'user-agent': 'test' },
    })
    expect(result?.method).toBe('GET')
    expect(result?.headers).toEqual({ 'user-agent': 'test' })
  })

  it('passes through undefined', () => {
    expect(scrubRequestUrlFields(undefined)).toBeUndefined()
  })

  it('returns the same object reference when neither url nor query_string is present', () => {
    const input = { method: 'GET' }
    expect(scrubRequestUrlFields(input)).toBe(input)
  })

  it('returns the same object reference when the URL has no query string or fragment', () => {
    const input = { url: 'https://example.com/verify', method: 'GET' }
    expect(scrubRequestUrlFields(input)).toBe(input)
  })

  it.each([
    ['Referer', 'https://example.com/unsubscribe?token=abc123', 'https://example.com/unsubscribe'],
    ['referer', 'https://example.com/unsubscribe?token=abc123', 'https://example.com/unsubscribe'],
    ['referrer', 'https://example.com/unsubscribe?token=abc123', 'https://example.com/unsubscribe'],
  ])('strips the query string from a %s header value', (headerName, value, expected) => {
    const result = scrubRequestUrlFields({ headers: { [headerName]: value } })
    expect(result?.headers).toEqual({ [headerName]: expected })
  })

  it('leaves non-URL-bearing headers byte-identical when a rebuild is triggered', () => {
    const result = scrubRequestUrlFields({
      url: 'https://example.com/verify?token=abc123',
      headers: { 'user-agent': 'test', accept: 'text/html' },
    })
    expect(result?.headers).toEqual({ 'user-agent': 'test', accept: 'text/html' })
  })

  it('returns the same object reference when the referer header has no query string or fragment', () => {
    const input = { headers: { referer: 'https://example.com/unsubscribe' } }
    expect(scrubRequestUrlFields(input)).toBe(input)
  })

  it('returns the same object reference when headers are present but carry no referer, url, or query_string', () => {
    const input = { headers: { 'user-agent': 'test' } }
    expect(scrubRequestUrlFields(input)).toBe(input)
  })

  it('keeps the same headers object reference when a rebuild is triggered for an unrelated reason', () => {
    const headers = { referer: 'https://example.com/unsubscribe' }
    const result = scrubRequestUrlFields({
      query_string: 'token=abc123',
      headers,
    })
    expect(result?.headers).toBe(headers)
  })

  it('passes non-string header values through untouched', () => {
    const result = scrubRequestUrlFields({
      headers: {
        referer: 'https://example.com/unsubscribe?token=abc123',
        'x-forwarded-for': undefined,
      },
    })
    expect(result?.headers).toEqual({
      referer: 'https://example.com/unsubscribe',
      'x-forwarded-for': undefined,
    })
  })

  it('does not mutate the input headers object', () => {
    const headers = { referer: 'https://example.com/unsubscribe?token=abc123' }
    const input = { headers }
    scrubRequestUrlFields(input)
    expect(headers.referer).toBe('https://example.com/unsubscribe?token=abc123')
  })

  it('preserves adversarial request and header data-property keys during URL scrubbing', () => {
    const headers = Object.fromEntries([
      ['constructor', 'header-constructor'],
      ['__proto__', 'header-proto'],
      ['referer', 'https://example.com/reset?token=secret'],
    ])
    const request = Object.fromEntries([
      ['constructor', 'request-constructor'],
      ['__proto__', 'request-proto'],
      ['url', 'https://example.com/verify?token=secret'],
      ['headers', headers],
    ])

    const result = scrubRequestUrlFields(request) as Record<string, unknown>
    const resultHeaders = result.headers as Record<string, unknown>
    expect(result.constructor).toBe('request-constructor')
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe('request-proto')
    expect(resultHeaders.constructor).toBe('header-constructor')
    expect(Object.getOwnPropertyDescriptor(resultHeaders, '__proto__')?.value).toBe('header-proto')
    expect(resultHeaders.referer).toBe('https://example.com/reset')
  })
})
