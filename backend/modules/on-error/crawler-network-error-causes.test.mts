import { describe, expect, it } from 'vitest'
import { CrawlerNetworkError } from './errors.mts'
import {
  isCrawlerNetworkDnsError,
  isCrawlerNetworkTlsHostnameError,
} from './crawler-network-error-causes.mts'

describe('isCrawlerNetworkDnsError', () => {
  it('classifies DNS null-route causes as DNS errors', () => {
    const cause = Object.assign(new Error('DNS resolved example.com to null-route address: ::'), {
      code: 'DNS_NULL_ROUTE',
    })
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect(isCrawlerNetworkDnsError(err)).toBe(true)
  })

  it('returns false for non-DNS network errors', () => {
    const cause = new Error('connect ECONNRESET')
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })

  it('does not throw when a cause has no message', () => {
    const cause = new Error('placeholder')
    Object.defineProperty(cause, 'message', { value: undefined })
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect(() => isCrawlerNetworkDnsError(err)).not.toThrow()
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })

  it('terminates on a circular cause chain instead of looping forever', () => {
    const cause: Error & { cause?: unknown } = new Error('circular')
    cause.cause = cause
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect(() => isCrawlerNetworkDnsError(err)).not.toThrow()
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })
})

describe('isCrawlerNetworkTlsHostnameError', () => {
  it('classifies nested TLS hostname mismatch causes', () => {
    const tlsError = Object.assign(new Error("Hostname/IP does not match certificate's altnames"), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    })
    const fetchError = new TypeError('fetch failed', { cause: tlsError })
    const err = new CrawlerNetworkError('https://example.com', 100, fetchError)

    expect(isCrawlerNetworkTlsHostnameError(err)).toBe(true)
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })

  it('does not classify generic TLS errors as hostname mismatches', () => {
    const tlsError = Object.assign(new Error('certificate has expired'), {
      code: 'CERT_HAS_EXPIRED',
    })
    const fetchError = new TypeError('fetch failed', { cause: tlsError })
    const err = new CrawlerNetworkError('https://example.com', 100, fetchError)

    expect(isCrawlerNetworkTlsHostnameError(err)).toBe(false)
  })

  it('terminates on a circular cause chain instead of looping forever', () => {
    const cause: Error & { cause?: unknown } = new Error('circular')
    cause.cause = cause
    const err = new CrawlerNetworkError('https://example.com', 100, cause)
    expect(() => isCrawlerNetworkTlsHostnameError(err)).not.toThrow()
    expect(isCrawlerNetworkTlsHostnameError(err)).toBe(false)
  })
})
