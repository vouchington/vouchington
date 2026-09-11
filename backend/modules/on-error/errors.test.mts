import { describe, expect, it } from 'vitest'
import {
  CrawlerConnectError,
  CrawlerHttpClientError,
  CrawlerInvalidContentTypeError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
  HttpNoBodyError,
  HttpRateLimitError,
  HttpResponseSizeError,
  HttpServerError,
} from './errors.mts'
import { isExpectedCrawlerOperationalError } from './expected-crawler-operational-error.mts'

describe('CrawlerTimeoutError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerTimeoutError('https://example.com', 30_000, 31_000)
    expect(err.name).toBe('CrawlerTimeoutError')
    expect(err.code).toBe('CrawlerTimeoutError')
    expect(err.status).toBe(504)
    expect(err.url).toBe('https://example.com')
    expect(err.duration).toBe(31_000)
  })

  it('includes cause when provided', () => {
    const cause = new Error('original')
    const err = new CrawlerTimeoutError('https://example.com', 30_000, 31_000, cause)
    expect((err as Error & { cause?: Error }).cause).toBe(cause)
  })

  it('is an instance of Error', () => {
    expect(new CrawlerTimeoutError('https://example.com', 1000, 1000)).toBeInstanceOf(Error)
  })
})

describe('CrawlerNetworkError', () => {
  it('has correct structured properties', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new CrawlerNetworkError('https://example.com', 500, cause)
    expect(err.name).toBe('CrawlerNetworkError')
    expect(err.code).toBe('CrawlerNetworkError')
    expect(err.status).toBe(502)
    expect(err.url).toBe('https://example.com')
    expect(err.duration).toBe(500)
  })

  it('preserves cause error', () => {
    const cause = new Error('DNS lookup failed')
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect((err as Error & { cause?: Error }).cause).toBe(cause)
  })
})

describe('CrawlerConnectError', () => {
  it('has correct structured properties', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new CrawlerConnectError('https://example.com', 500, cause)
    expect(err.name).toBe('CrawlerConnectError')
    expect(err.code).toBe('CrawlerConnectError')
    expect(err.status).toBe(502)
    expect(err.url).toBe('https://example.com')
    expect(err.duration).toBe(500)
  })

  it('preserves cause error', () => {
    const cause = new Error('connect ECONNREFUSED 127.0.0.1:9222')
    const err = new CrawlerConnectError('https://example.com', 100, cause)
    expect((err as Error & { cause?: Error }).cause).toBe(cause)
  })

  it('is an instance of Error but not of CrawlerNetworkError', () => {
    const err = new CrawlerConnectError('https://example.com', 100, new Error('boom'))
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(CrawlerNetworkError)
  })
})

describe('CrawlerRateLimitError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerRateLimitError('https://example.com', 429, 100, 60_000)
    expect(err.name).toBe('CrawlerRateLimitError')
    expect(err.code).toBe('CrawlerRateLimitError')
    expect(err.status).toBe(429)
    expect(err.url).toBe('https://example.com')
    expect(err.retryAfterMs).toBe(60_000)
    expect(err.duration).toBe(100)
  })

  it('defaults retryAfterMs to null', () => {
    const err = new CrawlerRateLimitError('https://example.com', 429, 100)
    expect(err.retryAfterMs).toBeNull()
  })

  it('supports custom status code', () => {
    const err = new CrawlerRateLimitError('https://example.com', 503, 100, null)
    expect(err.status).toBe(503)
  })
})

describe('CrawlerServerError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerServerError('https://example.com', 500, 200)
    expect(err.name).toBe('CrawlerServerError')
    expect(err.code).toBe('CrawlerServerError')
    expect(err.status).toBe(500)
    expect(err.url).toBe('https://example.com')
    expect(err.duration).toBe(200)
  })

  it('supports 503 status', () => {
    const err = new CrawlerServerError('https://example.com', 503, 100)
    expect(err.status).toBe(503)
  })
})

describe('CrawlerResponseSizeExceededError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerResponseSizeExceededError(
      'https://example.com',
      2_000_000,
      1_000_000,
      500,
    )
    expect(err.name).toBe('CrawlerResponseSizeExceededError')
    expect(err.code).toBe('CrawlerResponseSizeExceededError')
    expect(err.status).toBe(413)
    expect(err.url).toBe('https://example.com')
    expect(err.size).toBe(2_000_000)
    expect(err.maxSize).toBe(1_000_000)
    expect(err.duration).toBe(500)
  })
})

describe('CrawlerHttpClientError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerHttpClientError('https://example.com', 403, 100)
    expect(err.name).toBe('CrawlerHttpClientError')
    expect(err.code).toBe('CrawlerHttpClientError')
    expect(err.status).toBe(403)
    expect(err.url).toBe('https://example.com')
    expect(err.duration).toBe(100)
  })

  it('supports any 4xx status', () => {
    const err = new CrawlerHttpClientError('https://example.com', 404, 50)
    expect(err.status).toBe(404)
  })
})

describe('CrawlerInvalidContentTypeError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerInvalidContentTypeError('https://example.com/feed', 'text/html', 100, [
      'application/rss+xml',
      'application/atom+xml',
    ])
    expect(err.name).toBe('CrawlerInvalidContentTypeError')
    expect(err.code).toBe('CrawlerInvalidContentTypeError')
    expect(err.status).toBe(415)
    expect(err.url).toBe('https://example.com/feed')
    expect(err.contentType).toBe('text/html')
    expect(err.duration).toBe(100)
  })
})

describe('HttpRateLimitError', () => {
  it('has correct structured properties', () => {
    const err = new HttpRateLimitError('https://example.com', 429, 30_000)
    expect(err.name).toBe('HttpRateLimitError')
    expect(err.code).toBe('HTTP_RATE_LIMIT')
    expect(err.status).toBe(429)
    expect(err.retryAfterMs).toBe(30_000)
  })

  it('supports null retryAfterMs', () => {
    const err = new HttpRateLimitError('https://example.com', 429, null)
    expect(err.retryAfterMs).toBeNull()
  })
})

describe('HttpServerError', () => {
  it('has correct structured properties', () => {
    const err = new HttpServerError('https://example.com', 500)
    expect(err.name).toBe('HttpServerError')
    expect(err.code).toBe('HTTP_SERVER_ERROR')
    expect(err.status).toBe(500)
  })
})

describe('HttpResponseSizeError', () => {
  it('has correct structured properties', () => {
    const err = new HttpResponseSizeError('https://example.com', 5_000_000, 1_000_000)
    expect(err.name).toBe('HttpResponseSizeError')
    expect(err.code).toBe('HTTP_RESPONSE_SIZE_EXCEEDED')
    expect(err.status).toBe(413)
    expect(err.actualSize).toBe(5_000_000)
    expect(err.maxSize).toBe(1_000_000)
  })
})

describe('HttpNoBodyError', () => {
  it('has correct structured properties', () => {
    const err = new HttpNoBodyError('https://example.com')
    expect(err.name).toBe('HttpNoBodyError')
    expect(err.code).toBe('HTTP_NO_BODY')
    expect(err.status).toBe(502)
  })
})

describe('CrawlerSsrfError', () => {
  it('has correct structured properties', () => {
    const err = new CrawlerSsrfError('https://10.0.0.1/', 'IP address is private: 10.0.0.1')
    expect(err.name).toBe('CrawlerSsrfError')
    expect(err.code).toBe('CrawlerSsrfError')
    expect(err.status).toBe(403)
    expect(err.url).toBe('https://10.0.0.1/')
  })

  it('includes url and reason in message', () => {
    const err = new CrawlerSsrfError('https://localhost/', 'hostname not allowed: localhost')
    expect(() => {
      throw err
    }).toThrow(/https:\/\/localhost\//)
    expect(() => {
      throw err
    }).toThrow(/hostname not allowed: localhost/)
  })

  it('is an instance of Error', () => {
    expect(new CrawlerSsrfError('https://example.com/', 'reason')).toBeInstanceOf(Error)
  })
})

describe('isExpectedCrawlerOperationalError', () => {
  it.each([
    ['timeout', new CrawlerTimeoutError('https://example.com', 1000, 1000)],
    ['network', new CrawlerNetworkError('https://example.com', 100, new Error('ENOTFOUND'))],
    ['connect', new CrawlerConnectError('https://example.com', 100, new Error('ECONNREFUSED'))],
    ['rate limit', new CrawlerRateLimitError('https://example.com', 429, 100, 10_000)],
    ['server', new CrawlerServerError('https://example.com', 500, 100)],
    [
      'response size',
      new CrawlerResponseSizeExceededError('https://example.com', 2_000_000, 1_000_000, 100),
    ],
    ['client', new CrawlerHttpClientError('https://example.com', 404, 100)],
    [
      'content type',
      new CrawlerInvalidContentTypeError('https://example.com/feed', 'text/html', 100, [
        'application/rss+xml',
      ]),
    ],
    ['ssrf', new CrawlerSsrfError('https://10.0.0.1/', 'private IP')],
    ['no body', new HttpNoBodyError('https://example.com')],
  ])('returns true for expected crawler %s errors', (_label, error) => {
    expect(isExpectedCrawlerOperationalError(error)).toBe(true)
  })

  it.each([
    ['plain Error', new Error('boom')],
    ['low-level HTTP server error', new HttpServerError('https://example.com', 500)],
    ['low-level HTTP rate limit error', new HttpRateLimitError('https://example.com', 429, null)],
    [
      'low-level HTTP response size error',
      new HttpResponseSizeError('https://example.com', 2_000_000, 1_000_000),
    ],
  ])('returns false for %s', (_label, error) => {
    expect(isExpectedCrawlerOperationalError(error)).toBe(false)
  })
})
