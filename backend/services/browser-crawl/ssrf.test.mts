import { describe, expect, it } from 'vitest'
import { assertSafeUrlSync } from './ssrf.mts'
import { CrawlerSsrfError } from '@modules/on-error/errors'

describe('assertSafeUrlSync', () => {
  it('throws for localhost', () => {
    expect(() => assertSafeUrlSync('http://localhost/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for .local hostname', () => {
    expect(() => assertSafeUrlSync('http://internal.local/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for private IPv4 address (10.x)', () => {
    expect(() => assertSafeUrlSync('http://10.0.0.1/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for private IPv4 address (192.168.x)', () => {
    expect(() => assertSafeUrlSync('http://192.168.1.1/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for private IPv4 address (172.16.x)', () => {
    expect(() => assertSafeUrlSync('http://172.16.0.1/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for loopback (127.0.0.1)', () => {
    expect(() => assertSafeUrlSync('http://127.0.0.1/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for non-http(s) scheme', () => {
    expect(() => assertSafeUrlSync('ftp://example.com/path')).toThrow(CrawlerSsrfError)
  })

  it('throws for invalid URL', () => {
    expect(() => assertSafeUrlSync('not-a-url')).toThrow('Invalid URL: not-a-url')
  })

  it('passes for public http URL', () => {
    expect(() => assertSafeUrlSync('http://example.com/path')).not.toThrow()
  })

  it('passes for public https URL', () => {
    expect(() => assertSafeUrlSync('https://example.com/path')).not.toThrow()
  })

  it('throws for ws: scheme by default', () => {
    // Fixture string passed to the synchronous assertSafeUrlSync validator, not a live connection; the test asserts this URL is rejected.
    expect(() => assertSafeUrlSync('ws://example.com/path')).toThrow(CrawlerSsrfError)
  })

  it('passes for public ws: URL when ws:/wss: are explicitly allowed', () => {
    // Fixture string passed to the synchronous assertSafeUrlSync validator, not a live connection.
    expect(() => assertSafeUrlSync('ws://example.com/path', ['ws:', 'wss:'])).not.toThrow()
  })

  it('passes for public wss: URL when ws:/wss: are explicitly allowed', () => {
    expect(() => assertSafeUrlSync('wss://example.com/path', ['ws:', 'wss:'])).not.toThrow()
  })

  it('still throws for a private-IP ws: URL even when ws:/wss: are explicitly allowed', () => {
    // Fixture string passed to the synchronous assertSafeUrlSync validator, not a live connection; the test asserts this URL is rejected.
    expect(() => assertSafeUrlSync('ws://192.168.1.1/path', ['ws:', 'wss:'])).toThrow(
      CrawlerSsrfError,
    )
  })

  it('still throws for http: when the allowed set is narrowed to ws:/wss: only', () => {
    expect(() => assertSafeUrlSync('http://example.com/path', ['ws:', 'wss:'])).toThrow(
      CrawlerSsrfError,
    )
  })
})
