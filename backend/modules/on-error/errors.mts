export class CrawlerTimeoutError extends Error {
  code: string
  status: number
  url: string
  duration: number

  constructor(url: string, timeoutMs: number, duration: number, cause?: Error) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`, { cause })
    this.name = 'CrawlerTimeoutError'
    this.code = 'CrawlerTimeoutError'
    this.status = 504
    this.url = url
    this.duration = duration
  }
}

export class CrawlerNetworkError extends Error {
  code: string
  status: number
  url: string
  duration: number

  constructor(url: string, duration: number, cause: Error) {
    super(`Network error while fetching ${url}: ${cause.message}`, { cause })
    this.name = 'CrawlerNetworkError'
    this.code = 'CrawlerNetworkError'
    this.status = 502
    this.url = url
    this.duration = duration
  }
}

export class CrawlerConnectError extends Error {
  readonly code: string
  readonly status: number
  readonly url: string
  readonly duration: number

  constructor(url: string, duration: number, cause: Error) {
    super(`Failed to reach browser provider while crawling ${url}: ${cause.message}`, { cause })
    this.name = 'CrawlerConnectError'
    this.code = 'CrawlerConnectError'
    this.status = 502
    this.url = url
    this.duration = duration
  }
}

export class CrawlerRateLimitError extends Error {
  code: string
  status: number
  retryAfterMs: number | null
  url: string
  duration: number

  constructor(
    url: string,
    status: number,
    duration: number,
    retryAfterMs: number | null = null,
    cause?: Error,
  ) {
    super(
      `Rate limit exceeded for ${url} (HTTP ${status})${retryAfterMs != null ? `, retry after ${retryAfterMs}ms` : ''}`,
      { cause },
    )
    this.name = 'CrawlerRateLimitError'
    this.code = 'CrawlerRateLimitError'
    this.status = status
    this.retryAfterMs = retryAfterMs
    this.url = url
    this.duration = duration
  }
}

export class CrawlerServerError extends Error {
  code: string
  status: number
  url: string
  duration: number

  constructor(url: string, status: number, duration: number, cause?: Error) {
    super(`Server error while fetching ${url} (HTTP ${status})`, { cause })
    this.name = 'CrawlerServerError'
    this.code = 'CrawlerServerError'
    this.status = status
    this.url = url
    this.duration = duration
  }
}

export class CrawlerResponseSizeExceededError extends Error {
  code: string
  status: number
  url: string
  size: number
  maxSize: number
  duration: number

  constructor(url: string, size: number, maxSize: number, duration: number, cause?: Error) {
    super(
      `Response size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes) for ${url}`,
      { cause },
    )
    this.name = 'CrawlerResponseSizeExceededError'
    this.code = 'CrawlerResponseSizeExceededError'
    this.status = 413
    this.url = url
    this.size = size
    this.maxSize = maxSize
    this.duration = duration
  }
}

export {
  HttpNoBodyError,
  HttpRateLimitError,
  HttpResponseSizeError,
  HttpServerError,
} from './errors-http.mts'

export class CrawlerInvalidContentTypeError extends Error {
  code: string
  status: number
  url: string
  contentType: string
  duration: number

  constructor(url: string, contentType: string, duration: number, expectedTypes: string[]) {
    super(
      `Invalid content type for RSS feed: ${contentType} (expected one of: ${expectedTypes.join(', ')})`,
    )
    this.name = 'CrawlerInvalidContentTypeError'
    this.code = 'CrawlerInvalidContentTypeError'
    this.status = 415
    this.url = url
    this.contentType = contentType
    this.duration = duration
  }
}

export class CrawlerSsrfError extends Error {
  code: string
  status: number
  url: string

  constructor(url: string, reason: string) {
    super(`SSRF protection blocked request to ${url}: ${reason}`)
    this.name = 'CrawlerSsrfError'
    this.code = 'CrawlerSsrfError'
    this.status = 403
    this.url = url
  }
}

export class CrawlerHttpClientError extends Error {
  code: string
  status: number
  url: string
  duration: number

  constructor(url: string, status: number, duration: number, cause?: Error) {
    super(`Failed to fetch ${url}, got status code ${status}`, { cause })
    this.name = 'CrawlerHttpClientError'
    this.code = 'CrawlerHttpClientError'
    this.status = status
    this.url = url
    this.duration = duration
  }
}

export {
  isCrawlerNetworkDnsError,
  isCrawlerNetworkTlsHostnameError,
} from './crawler-network-error-causes.mts'
