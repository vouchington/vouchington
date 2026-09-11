import { describe, expect, it } from 'vitest'
import {
  computeParentPath,
  extractDomain,
  extractScheme,
  isExternalHttpUrl,
  isHostname,
  matchDomain,
  matchesPathnamePattern,
  normalizeHostname,
  sanitizeImageUrl,
  sanitizeLinkUrl,
} from './urls.mts'

describe('extractScheme', () => {
  it('extracts and lowercases a valid scheme', () => {
    expect(extractScheme('HTTPS://example.com')).toBe('https')
    expect(extractScheme('mailto:tests@voucha.ai')).toBe('mailto')
  })

  it('returns null when no scheme is present', () => {
    expect(extractScheme('example.com')).toBe(null)
  })
})

describe('sanitizeLinkUrl', () => {
  const scriptUrl = `java${'script'}:alert(1)`

  it('allows http, https, mailto, and tel schemes', () => {
    expect(sanitizeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(sanitizeLinkUrl('https://example.com')).toBe('https://example.com')
    expect(sanitizeLinkUrl('mailto:tests@voucha.ai')).toBe('mailto:tests@voucha.ai')
    expect(sanitizeLinkUrl('tel:+1234567890')).toBe('tel:+1234567890')
  })

  it('rejects unsupported schemes', () => {
    expect(sanitizeLinkUrl('ftp://example.com')).toBe(null)
    expect(sanitizeLinkUrl(scriptUrl)).toBe(null)
  })

  it('rejects network-path references and control characters', () => {
    expect(sanitizeLinkUrl('//example.com/path')).toBe(null)
    expect(sanitizeLinkUrl('https://example.com/\u0000path')).toBe(null)
  })

  it('handles empty values, trims whitespace, and allows schemeless URLs', () => {
    expect(sanitizeLinkUrl(null)).toBe(null)
    expect(sanitizeLinkUrl('   ')).toBe(null)
    expect(sanitizeLinkUrl('  https://example.com  ')).toBe('https://example.com')
    expect(sanitizeLinkUrl('example.com')).toBe('example.com')
  })
})

describe('sanitizeImageUrl', () => {
  it('allows http and https URLs only', () => {
    expect(sanitizeImageUrl('http://example.com/image.jpg')).toBe('http://example.com/image.jpg')
    expect(sanitizeImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg')
  })

  it('rejects non-http schemes and empty values', () => {
    expect(sanitizeImageUrl('mailto:tests@voucha.ai')).toBe(null)
    expect(sanitizeImageUrl('tel:+1234567890')).toBe(null)
    expect(sanitizeImageUrl('ftp://example.com/image.jpg')).toBe(null)
    expect(sanitizeImageUrl(null)).toBe(null)
    expect(sanitizeImageUrl('')).toBe(null)
  })

  it('rejects network-path references and control characters', () => {
    expect(sanitizeImageUrl('//example.com/image.jpg')).toBe(null)
    expect(sanitizeImageUrl('https://example.com/\u0000image.jpg')).toBe(null)
  })
})

describe('isExternalHttpUrl', () => {
  it('returns true for explicit http and https URLs', () => {
    expect(isExternalHttpUrl('http://example.com')).toBe(true)
    expect(isExternalHttpUrl('https://example.com')).toBe(true)
  })

  it('returns false for non-http, empty, and schemeless values', () => {
    expect(isExternalHttpUrl('mailto:tests@voucha.ai')).toBe(false)
    expect(isExternalHttpUrl('tel:+1234567890')).toBe(false)
    expect(isExternalHttpUrl(null)).toBe(false)
    expect(isExternalHttpUrl('')).toBe(false)
    expect(isExternalHttpUrl('example.com')).toBe(false)
  })
})

describe('isHostname', () => {
  it('validates lowercase hostnames and IP-like values', () => {
    expect(isHostname('example.com')).toBe(true)
    expect(isHostname('sub.example.com')).toBe(true)
    expect(isHostname('api-v2.example.co.uk')).toBe(true)
    expect(isHostname('192.168.1.1')).toBe(true)
  })

  it('rejects invalid hostnames', () => {
    expect(isHostname('')).toBe(false)
    expect(isHostname('EXAMPLE.COM')).toBe(false)
    expect(isHostname('example_.com')).toBe(false)
    expect(isHostname('example com')).toBe(false)
  })
})

describe('matchDomain', () => {
  it('matches exact and wildcard domains', () => {
    expect(matchDomain('example.com', 'example.com')).toBe(true)
    expect(matchDomain('example.com', ['example.com'])).toBe(true)
    expect(matchDomain('sub.example.com', '*.example.com')).toBe(true)
    expect(matchDomain('deep.sub.example.com', '*.example.com')).toBe(true)
    expect(matchDomain('example.com', '*.example.com')).toBe(true)
  })

  it('does not match different domains', () => {
    expect(matchDomain('example.com', 'other.com')).toBe(false)
    expect(matchDomain('example.com', ['other.com'])).toBe(false)
    expect(matchDomain('example.com', '*.other.com')).toBe(false)
    expect(matchDomain('sub.example.com', '*.other.com')).toBe(false)
    expect(matchDomain('wwwchase.com', '*.chase.com')).toBe(false)
  })

  it('matches against multiple patterns', () => {
    expect(matchDomain('example.com', ['example.com', 'other.com'])).toBe(true)
    expect(matchDomain('other.com', ['example.com', 'other.com'])).toBe(true)
    expect(matchDomain('third.com', ['example.com', 'other.com'])).toBe(false)
  })
})

describe('extractDomain', () => {
  it('extracts domains from valid URLs', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com')
    expect(extractDomain('https://sub.example.com/path')).toBe('sub.example.com')
    expect(extractDomain('http://example.com:8080/path')).toBe('example.com')
  })

  it('returns unknown for invalid URLs', () => {
    expect(extractDomain('not a url')).toBe('unknown')
    expect(extractDomain('')).toBe('unknown')
  })
})

describe('computeParentPath', () => {
  it('returns null for root path', () => {
    expect(computeParentPath('/')).toBe(null)
  })

  it('returns / for a single-level path', () => {
    expect(computeParentPath('/about')).toBe('/')
  })

  it('returns the first-level directory for nested paths', () => {
    expect(computeParentPath('/blog/2024/my-post')).toBe('/blog')
    expect(computeParentPath('/blog/post')).toBe('/blog')
    expect(computeParentPath('/a/b/c/d')).toBe('/a')
  })
})

describe('matchesPathnamePattern', () => {
  it('matches exact pathname patterns', () => {
    expect(matchesPathnamePattern('/refer', '/refer')).toBe(true)
    expect(matchesPathnamePattern('/other', '/refer')).toBe(false)
  })

  it('matches SQL LIKE wildcards', () => {
    expect(matchesPathnamePattern('/refer/abc123', '/refer/%')).toBe(true)
    expect(matchesPathnamePattern('/refer/', '/refer/%')).toBe(true)
    expect(matchesPathnamePattern('/anything/refer', '%/refer')).toBe(true)
    expect(matchesPathnamePattern('/refer/a', '/refer/_')).toBe(true)
    expect(matchesPathnamePattern('/refer/ab', '/refer/_')).toBe(false)
    expect(matchesPathnamePattern('/refer/a/anything', '/refer/_/%')).toBe(true)
    expect(matchesPathnamePattern('/refer/ab/anything', '/refer/_/%')).toBe(false)
  })

  it('matches special regex characters literally in patterns', () => {
    expect(matchesPathnamePattern('/refer.123', '/refer.123')).toBe(true)
    expect(matchesPathnamePattern('/refer.html', '/refer.html')).toBe(true)
    expect(matchesPathnamePattern('/referXhtml', '/refer.html')).toBe(false)
  })

  it('matches pathnames containing literal percent signs or percent-encoded characters', () => {
    expect(matchesPathnamePattern('/refer/%20', '/refer/%')).toBe(true)
    expect(matchesPathnamePattern('/refer/%20', '/refer/%/hello')).toBe(false)
    expect(matchesPathnamePattern('/refer/%20/hello', '/refer/%/hello')).toBe(true)
    expect(matchesPathnamePattern('/refer/%', '/refer/%')).toBe(true)
  })

  it('prevents ReDoS from patterns with many wildcards', () => {
    const pattern = `${'%'.repeat(100)}X`
    const pathname = 'a'.repeat(1000)

    const startTime = performance.now()
    expect(matchesPathnamePattern(pathname, pattern)).toBe(false)
    const duration = performance.now() - startTime

    expect(duration).toBeLessThan(100)
  })
})

describe('normalizeHostname', () => {
  it('returns a bare domain unchanged', () => {
    expect(normalizeHostname('example.com')).toBe('example.com')
    expect(normalizeHostname('www.chase.com')).toBe('www.chase.com')
    expect(normalizeHostname('sub.example.co.uk')).toBe('sub.example.co.uk')
  })

  it('strips https:// protocol', () => {
    expect(normalizeHostname('https://example.com')).toBe('example.com')
    expect(normalizeHostname('https://www.chase.com')).toBe('www.chase.com')
  })

  it('strips http:// protocol', () => {
    expect(normalizeHostname('http://example.com')).toBe('example.com')
  })

  it('normalizes malformed http/https protocol prefixes', () => {
    expect(normalizeHostname('https:/example.com')).toBe('example.com')
    expect(normalizeHostname('https:/example.com/path')).toBe('example.com')
    expect(normalizeHostname('http:/example.com')).toBe('example.com')
    expect(normalizeHostname('HTTPS:/example.com/path')).toBe('example.com')
    expect(normalizeHostname('http:example.com')).toBe('example.com')
    expect(normalizeHostname('https:example.com')).toBe('example.com')
  })

  it('strips trailing slash', () => {
    expect(normalizeHostname('https://example.com/')).toBe('example.com')
    expect(normalizeHostname('example.com/')).toBe('example.com')
  })

  it('strips path, query, and hash', () => {
    expect(normalizeHostname('https://www.chase.com/anything?x=1')).toBe('www.chase.com')
    expect(normalizeHostname('example.com/some/path')).toBe('example.com')
    expect(normalizeHostname('example.com?x=1')).toBe('example.com')
    expect(normalizeHostname('example.com/path#hash')).toBe('example.com')
  })

  it('strips port', () => {
    expect(normalizeHostname('example.com:8080')).toBe('example.com')
    expect(normalizeHostname('https://example.com:443')).toBe('example.com')
  })

  it('lowercases the hostname', () => {
    expect(normalizeHostname('EXAMPLE.COM')).toBe('example.com')
    expect(normalizeHostname('https://EXAMPLE.COM/Path')).toBe('example.com')
  })

  it('preserves WHATWG punycode normalization for non-ASCII hostnames', () => {
    expect(normalizeHostname('münich.com')).toBe('xn--mnich-kva.com')
    expect(normalizeHostname('https://MÜNICH.com/path')).toBe('xn--mnich-kva.com')
  })

  it('strips a trailing FQDN dot', () => {
    expect(normalizeHostname('example.com.')).toBe('example.com')
    expect(normalizeHostname('https://example.com./')).toBe('example.com')
  })

  it('is idempotent', () => {
    const once = normalizeHostname('https://www.EXAMPLE.com/path?q=1')
    expect(normalizeHostname(once!)).toBe(once)
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHostname('  example.com  ')).toBe('example.com')
    expect(normalizeHostname('  https://example.com/  ')).toBe('example.com')
  })

  it('returns null for empty or whitespace-only input', () => {
    expect(normalizeHostname('')).toBe(null)
    expect(normalizeHostname('   ')).toBe(null)
  })

  it('returns null for credential-bearing inputs', () => {
    expect(normalizeHostname('https://user:pass@mysite.com')).toBe(null)
    expect(normalizeHostname('user:pass@mysite.com')).toBe(null)
  })

  it('returns null for mailto: URIs', () => {
    // mailto: is parsed with a username, blocking it
    expect(normalizeHostname('mailto:foo@voucha.ai')).toBe(null)
  })

  it('returns null for hostnames with invalid characters', () => {
    expect(normalizeHostname('example_.com')).toBe(null)
    expect(normalizeHostname('example com')).toBe(null)
  })

  it('returns null for hostnames exceeding 255 characters', () => {
    const longLabel = 'a'.repeat(63)
    const tooLong = `${longLabel}.${longLabel}.${longLabel}.${longLabel}.com` // > 255 chars
    expect(normalizeHostname(tooLong)).toBe(null)
  })
})
