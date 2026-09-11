import { describe, expect, it } from 'vitest'
import {
  isFQDN,
  isHttpUrlWithoutFragment,
  isPublicHostname,
  normalizeUrlForUrlTable,
  validateHttpUrl,
  validateHttpUrlWithoutFragment,
} from './urls.mts'

const scriptUrl = `java${'script'}:alert(1)`

describe('isFQDN', () => {
  it('should validate fully qualified domain names', () => {
    expect(isFQDN('example.com')).toBe(true)
    expect(isFQDN('sub.example.com')).toBe(true)
  })

  it('should reject invalid FQDNs', () => {
    expect(isFQDN('example')).toBe(false)
    expect(isFQDN('')).toBe(false)
  })
})

describe('isHttpUrlWithoutFragment', () => {
  it('should validate HTTPS URLs', () => {
    expect(isHttpUrlWithoutFragment('https://example.com')).toBe(true)
    expect(isHttpUrlWithoutFragment('https://example.com/path')).toBe(true)
  })

  it('should validate HTTP URLs', () => {
    expect(isHttpUrlWithoutFragment('http://example.com')).toBe(true)
    expect(isHttpUrlWithoutFragment('http://example.com/path')).toBe(true)
  })

  it('should reject invalid URLs', () => {
    expect(isHttpUrlWithoutFragment('not a url')).toBe(false)
    expect(isHttpUrlWithoutFragment('')).toBe(false)
  })

  it('should reject non-http(s) schemes', () => {
    expect(isHttpUrlWithoutFragment('ftp://example.com')).toBe(false)
    expect(isHttpUrlWithoutFragment(scriptUrl)).toBe(false)
  })
})

describe('validateHttpUrlWithoutFragment', () => {
  it('should validate HTTPS URLs', () => {
    expect(validateHttpUrlWithoutFragment('https://example.com')).toBe(true)
    expect(validateHttpUrlWithoutFragment('https://example.com/path')).toBe(true)
  })

  it('should validate HTTP URLs', () => {
    expect(validateHttpUrlWithoutFragment('http://example.com')).toBe(true)
  })

  it('should reject URLs with fragments', () => {
    expect(validateHttpUrlWithoutFragment('https://example.com#fragment')).toBe(false)
  })
})

describe('validateHttpUrl', () => {
  it('should validate HTTP URLs with optional fragments', () => {
    expect(validateHttpUrl('https://example.com/signup#section')).toBe(true)
    expect(validateHttpUrl('http://example.com/signup')).toBe(true)
  })

  it('should reject malformed scheme-relative HTTP-looking URLs', () => {
    expect(validateHttpUrl('https:foo')).toBe(false)
    expect(validateHttpUrl('https:///signup')).toBe(false)
  })
})

describe('isPublicHostname', () => {
  it('returns true for FQDN hostnames and public IP literals', () => {
    expect(isPublicHostname('example.com')).toBe(true)
    expect(isPublicHostname('8.8.8.8')).toBe(true)
    expect(isPublicHostname('news.example.com')).toBe(true)
  })

  it('returns false for localhost, single-label, local, and private-IP hostnames', () => {
    expect(isPublicHostname('localhost')).toBe(false)
    expect(isPublicHostname('intranet')).toBe(false)
    expect(isPublicHostname('service.local')).toBe(false)
    expect(isPublicHostname('10.0.0.1')).toBe(false)
    expect(isPublicHostname('192.168.1.1')).toBe(false)
  })
})

describe('normalizeUrlForUrlTable', () => {
  it('should normalize valid HTTPS URLs', () => {
    const url = normalizeUrlForUrlTable('https://example.com/path')
    expect(url.toString()).toBe('https://example.com/path')
    expect(url.protocol).toBe('https:')
  })

  it('should upgrade http URLs to https', () => {
    const url = normalizeUrlForUrlTable('http://example.com')
    expect(url.toString()).toBe('https://example.com/')
    expect(url.protocol).toBe('https:')
  })

  it('should upgrade mixed-case HTTP scheme to https', () => {
    const url = normalizeUrlForUrlTable('HTTP://Example.COM/')
    expect(url.toString()).toBe('https://example.com/')
    expect(url.protocol).toBe('https:')
  })

  it('should canonicalize trailing-dot hostnames', () => {
    const url = normalizeUrlForUrlTable('https://Example.com./path#section')
    expect(url.toString()).toBe('https://example.com/path')
    expect(url.hostname).toBe('example.com')
  })

  it('should clear port 80 (http default) when upgrading to https', () => {
    const url = normalizeUrlForUrlTable('http://example.com:80/path')
    expect(url.toString()).toBe('https://example.com/path')
    expect(url.port).toBe('')
  })

  it('should preserve non-default ports when upgrading to https', () => {
    const url = normalizeUrlForUrlTable('http://example.com:8080/path')
    expect(url.toString()).toBe('https://example.com:8080/path')
    expect(url.port).toBe('8080')
  })

  it('should throw for non-http(s) schemes', () => {
    expect(() => normalizeUrlForUrlTable('ftp://example.com')).toThrow('URL must use http or https')
    expect(() => normalizeUrlForUrlTable(scriptUrl)).toThrow('URL must use http or https')
    expect(() => normalizeUrlForUrlTable('mailto:x@y.com')).toThrow('URL must use http or https')
  })

  it('should throw error for invalid URLs', () => {
    expect(() => normalizeUrlForUrlTable('not a url')).toThrow('Invalid URL')
  })

  it('should reject malformed URL strings that WHATWG URL can parse', () => {
    expect(() => normalizeUrlForUrlTable('https:foo.com/path')).toThrow('Invalid URL')
    expect(() => normalizeUrlForUrlTable('https:///signup')).toThrow('Invalid URL')
  })

  it('should strip fragments for URL table storage', () => {
    const url = normalizeUrlForUrlTable('https://example.com/path#section')
    expect(url.toString()).toBe('https://example.com/path')
    expect(url.hash).toBe('')
  })

  it('should upgrade http URLs and strip fragments', () => {
    const url = normalizeUrlForUrlTable('http://example.com/path#section')
    expect(url.toString()).toBe('https://example.com/path')
  })

  it('should reject URLs that exceed URL table length checks', () => {
    const uniqueHost = 'a.example.com'
    const path = 'a'.repeat(2048)
    expect(() => normalizeUrlForUrlTable(`https://${uniqueHost}/${path}`)).toThrow(
      'URL pathname exceeds 2048 characters',
    )
  })

  it('should reject URL table values that exceed the full URL length check', () => {
    const queryValue = 'a'.repeat(2083)
    expect(() => normalizeUrlForUrlTable(`https://a.example.com/?q=${queryValue}`)).toThrow(
      'URL exceeds 2083 characters',
    )
  })

  it('should throw TypeError with cause for malformed URLs', () => {
    expect(() => normalizeUrlForUrlTable('not a url')).toThrow(TypeError)
    let caughtError: TypeError | undefined
    try {
      normalizeUrlForUrlTable('not a url')
    } catch (error) {
      caughtError = error as TypeError
    }
    expect(caughtError).toBeInstanceOf(TypeError)
    expect(caughtError?.message).toContain('Invalid URL')
    expect(caughtError?.cause).toBeDefined()
  })
})

describe('normalizeUrlForUrlTable with preserveHttp: true', () => {
  it('should keep http: protocol when preserveHttp is true', () => {
    const url = normalizeUrlForUrlTable('http://example.com/feed.xml', { preserveHttp: true })
    expect(url.toString()).toBe('http://example.com/feed.xml')
    expect(url.protocol).toBe('http:')
  })

  it('should still normalize https: URLs when preserveHttp is true', () => {
    const url = normalizeUrlForUrlTable('https://example.com/feed.xml', { preserveHttp: true })
    expect(url.toString()).toBe('https://example.com/feed.xml')
    expect(url.protocol).toBe('https:')
  })

  it('should clear port 80 for http: when preserveHttp is true', () => {
    const url = normalizeUrlForUrlTable('http://example.com:80/feed.xml', { preserveHttp: true })
    expect(url.toString()).toBe('http://example.com/feed.xml')
    expect(url.port).toBe('')
  })

  it('should preserve non-default ports for http: when preserveHttp is true', () => {
    const url = normalizeUrlForUrlTable('http://example.com:8080/feed.xml', { preserveHttp: true })
    expect(url.toString()).toBe('http://example.com:8080/feed.xml')
    expect(url.port).toBe('8080')
  })

  it('should strip fragments when preserveHttp is true', () => {
    const url = normalizeUrlForUrlTable('http://example.com/feed.xml#section', {
      preserveHttp: true,
    })
    expect(url.toString()).toBe('http://example.com/feed.xml')
    expect(url.hash).toBe('')
  })

  it('should reject non-http(s) schemes even when preserveHttp is true', () => {
    expect(() => normalizeUrlForUrlTable('ftp://example.com', { preserveHttp: true })).toThrow(
      'URL must use http or https',
    )
  })

  it('should upgrade http: to https: when preserveHttp is false (default)', () => {
    const url = normalizeUrlForUrlTable('http://example.com/feed.xml', { preserveHttp: false })
    expect(url.toString()).toBe('https://example.com/feed.xml')
    expect(url.protocol).toBe('https:')
  })
})
