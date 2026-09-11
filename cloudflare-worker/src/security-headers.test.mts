import { describe, it, expect } from 'vitest'
import {
  addSecurityHeaders,
  isKeyedRssReferrerRequest,
  shouldPreserveOriginNoReferrer,
} from './security-headers.mts'

const EXPECTED_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'attribution-reporting=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'idle-detection=()',
  'interest-cohort=()',
  'join-ad-interest-group=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'run-ad-auction=()',
  'screen-wake-lock=()',
  'serial=()',
  'speaker-selection=()',
  'sync-xhr=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ')

describe('addSecurityHeaders', () => {
  it('sets base security headers in non-production', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, false, false)

    expect(result.headers.get('x-content-type-options')).toBe('nosniff')
    expect(result.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(result.headers.get('x-xss-protection')).toBe('0')
    expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(result.headers.get('permissions-policy')).toBe(EXPECTED_PERMISSIONS_POLICY)
    expect(result.headers.get('origin-agent-cluster')).toBe('?1')
    expect(result.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
    expect(result.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('omits HSTS header in non-production', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, false, false)

    expect(result.headers.get('strict-transport-security')).toBeNull()
  })

  it('sets HSTS without preload in production when hstsPreload=false', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, true, false)

    expect(result.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains',
    )
    // Verify preload is NOT included
    expect(result.headers.get('strict-transport-security')).not.toContain('preload')
  })

  it('sets HSTS with preload in production when hstsPreload=true', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, true, true)

    expect(result.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
  })

  it('includes all base headers in production regardless of preload setting', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, true, false)

    expect(result.headers.get('x-content-type-options')).toBe('nosniff')
    expect(result.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(result.headers.get('x-xss-protection')).toBe('0')
    expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(result.headers.get('permissions-policy')).toBe(EXPECTED_PERMISSIONS_POLICY)
    expect(result.headers.get('origin-agent-cluster')).toBe('?1')
    expect(result.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
    expect(result.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('sets content-security-policy header when csp parameter is provided', () => {
    const response = new Response('test')
    const csp = "default-src 'self'; script-src 'self'"
    const result = addSecurityHeaders(response, false, false, csp)

    expect(result.headers.get('content-security-policy')).toBe(csp)
  })

  it('does not set content-security-policy header when csp parameter is omitted', () => {
    const response = new Response('test')
    const result = addSecurityHeaders(response, false, false)

    expect(result.headers.get('content-security-policy')).toBeNull()
  })

  it('allows an OAuth callback document to retain its cross-origin opener', () => {
    const result = addSecurityHeaders(
      new Response('callback'),
      false,
      false,
      undefined,
      'unsafe-none',
    )
    expect(result.headers.get('cross-origin-opener-policy')).toBe('unsafe-none')
  })

  it('overrides origin cross-origin-resource-policy header with same-origin', () => {
    // withHeaders() unconditionally overwrites origin-provided headers, so an origin
    // that sets cross-origin-resource-policy: cross-origin will be forced to same-origin.
    const response = new Response('test', {
      headers: { 'cross-origin-resource-policy': 'cross-origin' },
    })
    const result = addSecurityHeaders(response, false, false)

    expect(result.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  describe('preserveKeyedRssReferrer', () => {
    it('preserves origin no-referrer when the flag is set', () => {
      const response = new Response('test', { headers: { 'referrer-policy': 'no-referrer' } })
      const result = addSecurityHeaders(response, false, false, undefined, undefined, true)

      expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    })

    it('keeps the global default when the flag is omitted', () => {
      const response = new Response('test', { headers: { 'referrer-policy': 'no-referrer' } })
      const result = addSecurityHeaders(response, false, false)

      expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    })

    it('keeps the global default when the origin did not emit exactly no-referrer', () => {
      // Value-restricted: the flag alone must never let an arbitrary origin
      // Referrer-Policy value through — only the literal "no-referrer" is trusted.
      const response = new Response('test', {
        headers: { 'referrer-policy': 'unsafe-url' },
      })
      const result = addSecurityHeaders(response, false, false, undefined, undefined, true)

      expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    })

    it('keeps the global default when the flag is set but the origin sent no header', () => {
      const response = new Response('test')
      const result = addSecurityHeaders(response, false, false, undefined, undefined, true)

      expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    })

    it('matches origin no-referrer case-insensitively', () => {
      const response = new Response('test', { headers: { 'referrer-policy': 'No-Referrer' } })
      const result = addSecurityHeaders(response, false, false, undefined, undefined, true)

      expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    })

    it('preserves no-referrer when the origin sent duplicate headers Headers.get() comma-joins', () => {
      // Headers.get() exposes repeated same-name headers as one comma-joined string
      // (e.g. "no-referrer, no-referrer") — a proxy in front of the origin or a future
      // middleware change could produce this. Still preserve no-referrer rather than
      // silently falling back to the weaker global default.
      const response = new Response('test', {
        headers: { 'referrer-policy': 'no-referrer, no-referrer' },
      })
      const result = addSecurityHeaders(response, false, false, undefined, undefined, true)

      expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    })
  })
})

describe('shouldPreserveOriginNoReferrer', () => {
  it.each(['facebook', 'x', 'github'])(
    'returns true for the %s OAuth broker callback',
    provider => {
      expect(
        shouldPreserveOriginNoReferrer(
          new URL(`https://voucha.ai/auth/callback/${provider}/broker?code=secret&state=secret`),
        ),
      ).toBe(true)
    },
  )

  it.each([
    '/auth/callback/google/broker',
    '/auth/callback/github/brokered',
    '/auth/callback/github/broker/extra',
    '/auth/callback/github',
  ])('returns false for callback near miss %s', pathname => {
    expect(shouldPreserveOriginNoReferrer(new URL(`https://voucha.ai${pathname}`))).toBe(false)
  })

  it('returns true for keyed RSS', () => {
    expect(
      shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/rss/posts?apikey=fil_xxx')),
    ).toBe(true)
  })
})

describe('isKeyedRssReferrerRequest', () => {
  it('returns true for keyed posts RSS', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/posts?apikey=fil_xxx'))).toBe(
      true,
    )
  })

  it('returns true for keyed news RSS', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/news?apikey=fil_xxx'))).toBe(
      true,
    )
  })

  it('returns false for anonymous RSS (no apikey)', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/posts'))).toBe(false)
  })

  it('returns false for an empty apikey value', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/posts?apikey='))).toBe(false)
  })

  it('returns true for the bare /rss route with an apikey', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss?apikey=fil_xxx'))).toBe(true)
  })

  it('returns false for non-RSS routes even with an apikey param', () => {
    expect(
      isKeyedRssReferrerRequest(new URL('https://voucha.ai/api/v1/posts?apikey=fil_xxx')),
    ).toBe(false)
  })
})
